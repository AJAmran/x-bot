'use client';

import React, { useState, useCallback, useEffect, useMemo, useRef, memo } from 'react';
import { MapContainer, TileLayer, Marker, Circle, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Crosshair, Navigation2, Home as HomeIcon, TriangleAlert } from 'lucide-react';
import { RESTAURANT_DATA, MAX_DELIVERY_RANGE } from '@/lib/constants';
import { reverseGeocode } from '@/lib/geocode';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

type LatLngTuple = [number, number];

const RESTAURANT: LatLngTuple = [
    RESTAURANT_DATA.restaurant.location.lat,
    RESTAURANT_DATA.restaurant.location.lng,
];
const TILE_URL = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';
/** Upper bound on how long the loading skeleton waits for tiles before giving up. */
const TILE_LOAD_TIMEOUT_MS = 6000;
/** Only the final drop of a gesture should produce an address lookup. */
const GEOCODE_DEBOUNCE_MS = 600;
/** Client-side politeness floor; the server proxy also throttles globally. */
const GEOCODE_MIN_INTERVAL_MS = 1_000;

interface LocationMapProps {
    onLocationSelect: (lat: number, lng: number, dist: number, verified: boolean, address?: string) => void;
    initialDistance?: number;
    /**
     * Shrinks the map for embedding inside a chat card. The full-height, 40px-radius version
     * is built for owning a whole screen; in a 420px conversation column it left the guest
     * scrolling past a map to reach the text around it.
     */
    compact?: boolean;
}

/** Great-circle distance in km (kept local — only the map needs it). */
function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
    const R = 6371;
    const dLat = (lat2 - lat1) * (Math.PI / 180);
    const dLon = (lon2 - lon1) * (Math.PI / 180);
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
        Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) *
        Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

/** Tapping the map moves the pin to that point. */
function ClickToPlace({ onPick }: { onPick: (latlng: L.LatLng) => void }) {
    useMapEvents({ click: event => onPick(event.latlng) });
    return null;
}

/**
 * Imperative recentre. `MapContainer` deliberately ignores `center` changes after mount,
 * so the GPS / "back to restaurant" buttons drive the view through here instead.
 */
function Recentre({ request }: { request: { position: LatLngTuple; nonce: number } | null }) {
    const map = useMap();
    useEffect(() => {
        if (request) map.flyTo(request.position, 16);
    }, [map, request]);
    return null;
}

export const LocationMap = memo(({ onLocationSelect, initialDistance, compact = false }: LocationMapProps) => {
    const [gpsLoading, setGpsLoading] = useState(false);
  const [tilesLoaded, setTilesLoaded] = useState(false);
    const [gpsError, setGpsError] = useState<string | null>(null);
    const [addressFetching, setAddressFetching] = useState(false);

    /**
     * The pin is the single source of truth for position and distance, and it lives here.
     *
     * This is the fix for the map being destroyed and rebuilt on every drop: that happened
     * because the old hand-rolled Leaflet map put `initialDistance` in its init effect's
     * dependency list, so the parent's distance update re-ran the effect *and* its cleanup —
     * which removed the map and remounted the pin on the restaurant. With react-leaflet the
     * map instance is owned by `MapContainer` and is never recreated by a prop change, so
     * `initialDistance` is now read exactly once, here.
     */
    const [pin, setPin] = useState<LatLngTuple>(() =>
        initialDistance !== undefined ? RESTAURANT : [RESTAURANT[0] - 0.003, RESTAURANT[1] - 0.003]
    );
    const [distance, setDistance] = useState<number | undefined>(initialDistance);
    const [flyRequest, setFlyRequest] = useState<{ position: LatLngTuple; nonce: number } | null>(null);

    const geocodeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
    const lastGeocodeAt = useRef(0);
    const userMarkerRef = useRef<L.Marker | null>(null);

    const insideZone = distance === undefined || distance <= MAX_DELIVERY_RANGE;

    // divIcons only — Leaflet's default marker icon resolves its images relative to the CSS
    // URL, which the bundler cannot resolve. Avoiding it also keeps the map asset-free.
    const restaurantIcon = useMemo(() => L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="background-color: #ea580c; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                 <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z"/></svg>
               </div>`,
        iconSize: [24, 24],
        iconAnchor: [12, 12],
    }), []);

    const userIcon = useMemo(() => L.divIcon({
        className: 'custom-div-icon',
        html: `<div style="position: relative;" class="user-marker-pulse">
                 <div style="background-color: #0f172a; width: 40px; height: 40px; border-radius: 50% 50% 50% 0; border: 3px solid white; box-shadow: 0 8px 15px rgba(0,0,0,0.4); transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;">
                   <div style="width: 12px; height: 12px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
                 </div>
               </div>`,
        iconSize: [40, 40],
        iconAnchor: [20, 40],
    }), []);

    useEffect(() => () => {
        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
    }, []);

    /**
     * Move the pin and report the new position. Coordinates are reported *immediately* so the
     * distance readout never waits on a network round-trip; the geocoded address follows as a
     * second call once it resolves.
     */
    const commitPosition = useCallback((next: L.LatLng, shouldGeocode: boolean) => {
        const latlng: LatLngTuple = [next.lat, next.lng];
        setPin(latlng);

        const dist = calculateDistance(RESTAURANT[0], RESTAURANT[1], latlng[0], latlng[1]);
        setDistance(dist);
        const inside = dist <= MAX_DELIVERY_RANGE;

        onLocationSelect(latlng[0], latlng[1], dist, inside, undefined);

        if (!shouldGeocode) return;

        if (geocodeTimer.current) clearTimeout(geocodeTimer.current);
        geocodeTimer.current = setTimeout(async () => {
            const elapsed = Date.now() - lastGeocodeAt.current;
            if (elapsed < GEOCODE_MIN_INTERVAL_MS) {
                await new Promise<void>(resolve => setTimeout(resolve, GEOCODE_MIN_INTERVAL_MS - elapsed));
            }
            lastGeocodeAt.current = Date.now();
            setAddressFetching(true);
            try {
                const address = await reverseGeocode(latlng[0], latlng[1]);
                if (address) onLocationSelect(latlng[0], latlng[1], dist, inside, address);
            } finally {
                setAddressFetching(false);
            }
        }, GEOCODE_DEBOUNCE_MS);
    }, [onLocationSelect]);

    // If the tile CDN is blocked or slow, `load` may never fire. Without this the skeleton
    // would sit on top of a working, draggable map forever.
    useEffect(() => {
        const timer = setTimeout(() => setTilesLoaded(true), TILE_LOAD_TIMEOUT_MS);
        return () => clearTimeout(timer);
    }, []);

    const handleUseGPS = () => {
        setGpsError(null);
        if (!navigator.geolocation) {
            setGpsError('Location is not supported by this browser. Please drag the pin instead.');
            return;
        }

        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            position => {
                const { latitude, longitude } = position.coords;
                setFlyRequest({ position: [latitude, longitude], nonce: Date.now() });
                commitPosition(L.latLng(latitude, longitude), true);
                setGpsLoading(false);
            },
            () => {
                setGpsError('Could not read your location. Please allow location access or drag the pin.');
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return (
        <div className={`relative w-full overflow-hidden border border-slate-200 group ${compact ? 'h-48 rounded-2xl shadow-md' : 'h-80 rounded-[2.5rem] shadow-2xl ring-4 ring-slate-100/50'}`}>
            {/*
              Tiles come from a third-party CDN over a phone connection, so there is a real
              window where the container is an empty grey box. The skeleton holds the exact
              footprint of the map so nothing reflows when the tiles land, and it is removed
              from the tree rather than hidden, so a screen reader never reads a placeholder.
            */}
            {!tilesLoaded && (
                <div className="absolute inset-0 z-[300] flex flex-col gap-3 bg-slate-100 p-4" aria-hidden="true">
                    <div className="flex items-center justify-between">
                        <Skeleton className="h-6 w-32 rounded-full" />
                        <Skeleton className="size-10 rounded-full" />
                    </div>
                    <Skeleton className="h-full w-full rounded-[2rem]" />
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-11 rounded-xl" />
                        <Skeleton className="h-11 flex-1 rounded-xl" />
                    </div>
                </div>
            )}
            <MapContainer
                center={pin}
                zoom={14}
                zoomControl={false}
                attributionControl={false}
                // The map lives inside a vertically scrollable panel, so the browser must not
                // steal the touch gesture for scrolling while the pin is being dragged.
                style={{ height: '100%', width: '100%', touchAction: 'none' }}
            >
                <TileLayer
                    url={TILE_URL}
                    attribution={TILE_ATTRIBUTION}
                    // Leaflet fires `load` once every visible tile has arrived, which is the
                    // only honest signal that the map is drawable — `whenReady` fires long
                    // before the first tile does.
                    eventHandlers={{ load: () => setTilesLoaded(true) }}
                />

                <Marker position={RESTAURANT} icon={restaurantIcon} title="Four Season Restaurant" zIndexOffset={1000} />

                <Circle
                    center={RESTAURANT}
                    radius={MAX_DELIVERY_RANGE * 1000}
                    pathOptions={{
                        color: insideZone ? '#16a34a' : '#ef4444',
                        fillColor: insideZone ? '#22c55e' : '#ef4444',
                        fillOpacity: 0.1,
                        weight: 2,
                        dashArray: '8, 8',
                    }}
                />

                <Marker
                    ref={userMarkerRef}
                    position={pin}
                    icon={userIcon}
                    draggable
                    eventHandlers={{
                        dragend: () => {
                            const marker = userMarkerRef.current;
                            if (marker) commitPosition(marker.getLatLng(), true);
                        },
                    }}
                />

                <ClickToPlace onPick={latlng => commitPosition(latlng, true)} />
                <Recentre request={flyRequest} />
            </MapContainer>

            {/* Top Information Panel */}
            <div className="absolute top-4 left-4 z-[400] flex flex-col gap-2 pointer-events-none">
                <div className="bg-slate-900/90 text-white backdrop-blur-xl shadow-2xl px-5 py-3 rounded-2xl text-[10px] font-black border border-white/10 flex flex-col gap-1 ring-1 ring-black/20">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-primary/20 rounded-lg">
                            <Navigation2 size={12} className="text-primary-ink fill-primary-ink rotate-45" />
                        </div>
                        <span className="uppercase tracking-[0.12em] text-white/90">Delivery Precision</span>
                    </div>
                    <div className="flex flex-col">
                        {addressFetching ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1.5 h-1.5 bg-primary rounded-full animate-pulse"></div>
                                <span className="text-[10px] text-primary-ink font-black uppercase tracking-widest">Pinpointing...</span>
                            </div>
                        ) : (
                            <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Drag pin to your exact spot</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Map Controls - Bottom Right */}
            <div className="absolute bottom-6 right-6 z-[400] flex flex-col gap-3">
                <div className="flex flex-col gap-2 bg-white/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/40 shadow-xl">
                    {/*
                      A native title attribute is not reachable by keyboard or announced by most
                      screen readers, so these two controls were effectively unlabelled for anyone
                      not using a mouse. The Tooltip gives the same hint a keyboard and touch user
                      can actually get, and the aria-label stays for assistive tech.
                    */}
                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    size="icon-lg"
                                    variant="outline"
                                    onClick={() => setFlyRequest({ position: RESTAURANT, nonce: Date.now() })}
                                    aria-label="Centre the map on the restaurant"
                                    className="group/home size-11 rounded-xl border-slate-100 bg-white text-slate-700 shadow-lg hover:bg-primary hover:text-primary-foreground"
                                />
                            }
                        >
                            <HomeIcon className="size-[18px] transition-transform group-hover/home:scale-110" />
                        </TooltipTrigger>
                        <TooltipContent side="left">Restaurant Location</TooltipContent>
                    </Tooltip>

                    <Tooltip>
                        <TooltipTrigger
                            render={
                                <Button
                                    type="button"
                                    size="icon-lg"
                                    variant={gpsLoading ? 'default' : 'outline'}
                                    onClick={handleUseGPS}
                                    aria-label="Use my current location"
                                    className={`relative size-11 rounded-xl border-slate-100 shadow-lg ${gpsLoading ? '' : 'bg-white text-slate-700 hover:bg-slate-900 hover:text-white'}`}
                                />
                            }
                        >
                            {gpsLoading ? (
                                <div className="relative flex items-center justify-center">
                                    <div className="absolute w-6 h-6 bg-primary-foreground/20 rounded-full animate-ping"></div>
                                    <div className="animate-spin h-4 w-4 border-2 border-primary-foreground border-t-transparent rounded-full" />
                                </div>
                            ) : (
                                <Crosshair className="size-[18px]" />
                            )}
                        </TooltipTrigger>
                        <TooltipContent side="left">Use my current location</TooltipContent>
                    </Tooltip>
                </div>
            </div>

            {gpsError && (
                <div className="absolute bottom-20 left-4 right-4 z-[400]">
                    <p className="flex items-start gap-2 bg-red-50/95 backdrop-blur border border-red-200 text-red-800 text-[10px] font-bold leading-snug rounded-xl px-3 py-2 shadow-lg">
                        <TriangleAlert size={13} className="shrink-0 mt-px" aria-hidden="true" />
                        {gpsError}
                    </p>
                </div>
            )}

            {/* Bottom Overlay Info */}
            <div className="absolute bottom-6 left-6 z-[400] pointer-events-none">
                <div className="bg-white/90 backdrop-blur shadow-xl border border-white px-3 py-1.5 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 bg-primary shadow-[0_0_8px_oklch(0.841 0.238 128.85 / 0.5)]"></div>
                    <span className="text-[10px] font-black text-slate-900 uppercase tracking-widest">Kitchen Range</span>
                </div>
            </div>

            {/* Range Badge Overlay — driven by live distance, not the initial prop */}
            {distance !== undefined && (
                <div className="absolute top-4 right-4 z-[400] pointer-events-none">
                    <div className={`px-3 py-1.5 rounded-xl backdrop-blur-md shadow-2xl border font-black text-[10px] uppercase tracking-widest flex items-center gap-2 animate-scale-in ${distance <= MAX_DELIVERY_RANGE
                            ? 'bg-green-500/10 border-green-500/50 text-green-600'
                            : 'bg-red-500/10 border-red-500/50 text-red-600'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${distance <= MAX_DELIVERY_RANGE ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        {distance <= MAX_DELIVERY_RANGE ? 'Serviceable' : 'Out of Reach'}
                    </div>
                </div>
            )}
        </div>
    );
});

LocationMap.displayName = 'LocationMap';
