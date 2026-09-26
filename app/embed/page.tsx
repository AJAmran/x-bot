import { ChatWidget } from '@/components/ChatWidget';

export default function Embed() {
    return (
        // h-dvh, not h-screen: 100vh is the *largest* viewport (browser chrome hidden), so on
        // a phone the bottom of this iframe is cut off by the URL bar until you scroll.
        <div className="w-full h-dvh bg-transparent overflow-hidden">
            <ChatWidget standalone initiallyOpen aiConfigured={Boolean(process.env.GEMINI_API_KEY?.trim())} />
        </div>
    );
}
