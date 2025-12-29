import { ChatWidget } from '@/components/ChatWidget';

export default function Embed() {
    return (
        <div className="w-full h-screen bg-transparent overflow-hidden">
            <ChatWidget standalone initiallyOpen />
        </div>
    );
}
