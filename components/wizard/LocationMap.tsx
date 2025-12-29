'use client';

import React, { useState, useEffect, useRef, memo, useCallback, useMemo } from 'react';
import { MapPin, Crosshair, Navigation2, Home as HomeIcon } from 'lucide-react';
import { RESTAURANT_DATA, MAX_DELIVERY_RANGE } from '@/lib/constants';

// Declare Leaflet globally
declare const L: any;

interface LocationMapProps {
    onLocationSelect: (lat: number, lng: number, dist: number, verified: boolean, address?: string) => void;
    initialDistance?: number;
}

export const LocationMap = memo(({ onLocationSelect, initialDistance }: LocationMapProps) => {
    const mapContainerRef = useRef<HTMLDivElement>(null);
    const mapInstanceRef = useRef<any>(null);
    const markerRef = useRef<any>(null);
    const circleRef = useRef<any>(null);
    const [gpsLoading, setGpsLoading] = useState(false);
    const [addressFetching, setAddressFetching] = useState(false);

    const restLocation = useMemo(() => [RESTAURANT_DATA.restaurant.location.lat, RESTAURANT_DATA.restaurant.location.lng] as [number, number], []);

    const calculateDistance = useCallback((lat1: number, lon1: number, lat2: number, lon2: number) => {
        const R = 6371;
        const dLat = (lat2 - lat1) * (Math.PI / 180);
        const dLon = (lon2 - lon1) * (Math.PI / 180);
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * (Math.PI / 180)) * Math.cos(lat2 * (Math.PI / 180)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }, []);

    const reverseGeocode = async (lat: number, lng: number) => {
        setAddressFetching(true);
        try {
            const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lng}`);
            const data = await res.json();
            if (data && data.display_name) {
                return data.display_name;
            }
        } catch (e) {
            console.error("Geocoding failed", e);
        } finally {
            setAddressFetching(false);
        }
        return null;
    };

    useEffect(() => {
        if (!mapContainerRef.current || typeof L === 'undefined') return;

        // Initialize map only once
        if (!mapInstanceRef.current) {
            // Ensure container is clean
            if (mapContainerRef.current) {
                (mapContainerRef.current as any)._leaflet_id = null;
            }

            const map = L.map(mapContainerRef.current, {
                center: restLocation,
                zoom: 14,
                zoomControl: false,
                attributionControl: false
            });

            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '© OpenStreetMap contributors'
            }).addTo(map);

            const restIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="background-color: #ea580c; width: 24px; height: 24px; border-radius: 50%; border: 3px solid white; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center;">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="white"><path d="M12 2L2 12h3v8h6v-6h2v6h6v-8h3L12 2z"/></svg>
                       </div>`,
                iconSize: [24, 24],
                iconAnchor: [12, 12]
            });
            L.marker(restLocation, { icon: restIcon, title: 'Restaurant', zIndexOffset: 1000 }).addTo(map);

            circleRef.current = L.circle(restLocation, {
                color: '#16a34a',
                fillColor: '#22c55e',
                fillOpacity: 0.1,
                weight: 2,
                dashArray: '8, 8',
                radius: MAX_DELIVERY_RANGE * 1000
            }).addTo(map);

            const userIcon = L.divIcon({
                className: 'custom-div-icon',
                html: `<div style="position: relative;" class="user-marker-pulse">
                         <div style="background-color: #0f172a; width: 40px; height: 40px; border-radius: 50% 50% 50% 0; border: 3px solid white; box-shadow: 0 8px 15px rgba(0,0,0,0.4); transform: rotate(-45deg); display: flex; align-items: center; justify-content: center;">
                            <div style="width: 12px; height: 12px; background: white; border-radius: 50%; transform: rotate(45deg);"></div>
                         </div>
                       </div>`,
                iconSize: [40, 40],
                iconAnchor: [20, 40]
            });

            // Use initialDistance only once for positioning
            const startPos = initialDistance ? restLocation : [restLocation[0] - 0.003, restLocation[1] - 0.003];
            markerRef.current = L.marker(startPos, { draggable: true, icon: userIcon }).addTo(map);

            const updateLocation = async (isManual = false) => {
                if (!markerRef.current || !circleRef.current) return;
                const pos = markerRef.current.getLatLng();
                const dist = calculateDistance(restLocation[0], restLocation[1], pos.lat, pos.lng);
                const isInside = dist <= MAX_DELIVERY_RANGE;

                circleRef.current.setStyle({
                    color: isInside ? '#16a34a' : '#ef4444',
                    fillColor: isInside ? '#22c55e' : '#ef4444'
                });

                let address = null;
                if (isManual) {
                    address = await reverseGeocode(pos.lat, pos.lng);
                }

                onLocationSelect(pos.lat, pos.lng, dist, isInside, address || undefined);
            };

            markerRef.current.on('drag', () => {
                if (!markerRef.current || !circleRef.current) return;
                const pos = markerRef.current.getLatLng();
                const dist = calculateDistance(restLocation[0], restLocation[1], pos.lat, pos.lng);
                const isInside = dist <= MAX_DELIVERY_RANGE;
                circleRef.current.setStyle({
                    color: isInside ? '#16a34a' : '#ef4444',
                    fillColor: isInside ? '#22c55e' : '#ef4444'
                });
            });

            markerRef.current.on('dragend', () => updateLocation(true));

            map.on('click', (e: any) => {
                if (!markerRef.current) return;
                markerRef.current.setLatLng(e.latlng);
                updateLocation(true);
            });

            // Trigger initial selection update
            updateLocation();
            mapInstanceRef.current = map;
        }

        return () => {
            if (mapInstanceRef.current) {
                mapInstanceRef.current.remove();
                mapInstanceRef.current = null;
            }
        };
    }, [calculateDistance, onLocationSelect, restLocation]);


    const handleUseGPS = () => {
        if (!navigator.geolocation) {
            alert("Geolocation not supported");
            return;
        }

        setGpsLoading(true);
        navigator.geolocation.getCurrentPosition(
            async (pos) => {
                const { latitude, longitude } = pos.coords;
                if (mapInstanceRef.current && markerRef.current) {
                    const newLatLng = new L.LatLng(latitude, longitude);
                    markerRef.current.setLatLng(newLatLng);
                    mapInstanceRef.current.setView(newLatLng, 16);

                    const dist = calculateDistance(restLocation[0], restLocation[1], latitude, longitude);
                    const isInside = dist <= MAX_DELIVERY_RANGE;
                    circleRef.current.setStyle({ color: isInside ? '#16a34a' : '#ef4444', fillColor: isInside ? '#22c55e' : '#ef4444' });

                    const address = await reverseGeocode(latitude, longitude);
                    onLocationSelect(latitude, longitude, dist, isInside, address || undefined);
                }
                setGpsLoading(false);
            },
            () => {
                alert("Could not get location. Please enable location permissions.");
                setGpsLoading(false);
            },
            { enableHighAccuracy: true, timeout: 10000 }
        );
    };

    return (
        <div className="relative w-full h-80 rounded-[2.5rem] overflow-hidden border border-slate-200 shadow-2xl group ring-4 ring-slate-100/50">
            <div ref={mapContainerRef} className="w-full h-full z-0 bg-slate-100" />

            {/* Top Information Panel */}
            <div className="absolute top-4 left-4 z-[400] flex flex-col gap-2 pointer-events-none">
                <div className="bg-slate-900/90 text-white backdrop-blur-xl shadow-2xl px-5 py-3 rounded-2xl text-[10px] font-black border border-white/10 flex flex-col gap-1 ring-1 ring-black/20">
                    <div className="flex items-center gap-2.5">
                        <div className="p-1.5 bg-brand-500/20 rounded-lg">
                            <Navigation2 size={12} className="text-brand-400 fill-brand-400 rotate-45" />
                        </div>
                        <span className="uppercase tracking-[0.12em] text-white/90">Delivery Precision</span>
                    </div>
                    <div className="flex flex-col">
                        {addressFetching ? (
                            <div className="flex items-center gap-1.5 mt-0.5">
                                <div className="w-1.5 h-1.5 rounded-full bg-brand-500 animate-pulse"></div>
                                <span className="text-[9px] text-brand-300 font-black uppercase tracking-widest">Pinpointing...</span>
                            </div>
                        ) : (
                            <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest mt-0.5">Drag pin to your exact spot</span>
                        )}
                    </div>
                </div>
            </div>

            {/* Map Controls - Bottom Right */}
            <div className="absolute bottom-6 right-6 z-[400] flex flex-col gap-3">
                <div className="flex flex-col gap-2 bg-white/40 backdrop-blur-md p-1.5 rounded-2xl border border-white/40 shadow-xl">
                    <button
                        type="button"
                        onClick={() => {
                            if (mapInstanceRef.current) {
                                mapInstanceRef.current.setView(restLocation, 16);
                            }
                        }}
                        title="Restaurant Location"
                        className="w-10 h-10 bg-white rounded-xl shadow-lg text-slate-700 hover:bg-brand-500 hover:text-white transition-all transform hover:scale-110 active:scale-90 flex items-center justify-center border border-slate-100 group/home"
                    >
                        <HomeIcon size={18} className="group-hover/home:scale-110 transition-transform" />
                    </button>

                    <button
                        type="button"
                        onClick={handleUseGPS}
                        className={`w-10 h-10 rounded-xl shadow-lg transition-all transform hover:scale-110 active:scale-90 flex items-center justify-center border border-slate-100 relative ${gpsLoading ? 'bg-brand-500 text-white' : 'bg-white text-slate-700 hover:bg-slate-900 hover:text-white'}`}
                    >
                        {gpsLoading ? (
                            <div className="relative flex items-center justify-center">
                                <div className="absolute w-6 h-6 bg-white/20 rounded-full animate-ping"></div>
                                <div className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                            </div>
                        ) : (
                            <Crosshair size={18} />
                        )}
                    </button>
                </div>
            </div>

            {/* Bottom Overlay Info */}
            <div className="absolute bottom-6 left-6 z-[400] pointer-events-none">
                <div className="bg-white/90 backdrop-blur shadow-xl border border-white px-3 py-1.5 rounded-xl flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-brand-500 shadow-[0_0_8px_rgba(234,88,12,0.5)]"></div>
                    <span className="text-[9px] font-black text-slate-900 uppercase tracking-widest">Kitchen Range</span>
                </div>
            </div>

            {/* Range Badge Overlay */}
            {initialDistance !== undefined && (
                <div className="absolute top-4 right-4 z-[400] pointer-events-none">
                    <div className={`px-3 py-1.5 rounded-xl backdrop-blur-md shadow-2xl border font-black text-[9px] uppercase tracking-widest flex items-center gap-2 animate-scale-in ${initialDistance <= MAX_DELIVERY_RANGE
                            ? 'bg-green-500/10 border-green-500/50 text-green-600'
                            : 'bg-red-500/10 border-red-500/50 text-red-600'
                        }`}>
                        <div className={`w-1.5 h-1.5 rounded-full ${initialDistance <= MAX_DELIVERY_RANGE ? 'bg-green-500' : 'bg-red-500'}`}></div>
                        {initialDistance <= MAX_DELIVERY_RANGE ? 'Serviceable' : 'Out of Reach'}
                    </div>
                </div>
            )}
        </div>
    );
});

LocationMap.displayName = 'LocationMap';
