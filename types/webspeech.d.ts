/**
 * Minimal Web Speech API typings.
 *
 * TypeScript's DOM lib does not include the Speech API, which is why the voice input was
 * previously `new (window as any).webkitSpeechRecognition()` with a hand-rolled global
 * `Window` augmentation inside a page component. These declarations cover only what the
 * widget actually uses, and `SpeechRecognition` is feature-detected at runtime because the
 * API is still Chromium-only.
 *
 * Reference: https://developer.mozilla.org/docs/Web/API/Web_Speech_API
 */

interface SpeechRecognitionAlternative {
    readonly transcript: string;
    readonly confidence: number;
}

interface SpeechRecognitionResult {
    readonly isFinal: boolean;
    readonly length: number;
    [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
    readonly length: number;
    [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent extends Event {
    readonly resultIndex: number;
    readonly results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent extends Event {
    readonly error: string;
    readonly message: string;
}

interface SpeechRecognition extends EventTarget {
    continuous: boolean;
    interimResults: boolean;
    lang: string;
    maxAlternatives: number;
    start(): void;
    stop(): void;
    abort(): void;
    onstart: ((event: Event) => void) | null;
    onend: ((event: Event) => void) | null;
    onresult: ((event: SpeechRecognitionEvent) => void) | null;
    onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
}

interface SpeechRecognitionConstructor {
    new (): SpeechRecognition;
}

interface Window {
    /** Chromium prefixes the constructor; Firefox/Safari do not implement it at all. */
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
    SpeechRecognition?: SpeechRecognitionConstructor;
}
