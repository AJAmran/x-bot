/**
 * SeasonBot AI Embed Script
 * Usage: <script src="https://your-domain.com/embed.js"></script>
 */
(function() {
    const BOT_URL = window.location.origin + '/embed'; // Assumes script is hosted on same domain or adjusted
    
    // Create floating trigger
    const trigger = document.createElement('div');
    trigger.id = 'seasonbot-trigger';
    Object.assign(trigger.style, {
        position: 'fixed',
        bottom: '24px',
        right: '24px',
        width: '64px',
        height: '64px',
        backgroundColor: '#ea580c',
        borderRadius: '50%',
        boxShadow: '0 8px 32px rgba(234, 88, 12, 0.4)',
        cursor: 'pointer',
        zIndex: '999999',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        transition: 'transform 0.3s cubic-bezier(0.175, 0.885, 0.32, 1.275)',
    });

    trigger.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"></path></svg>`;

    // Create Iframe Container
    const container = document.createElement('div');
    container.id = 'seasonbot-container';
    Object.assign(container.style, {
        position: 'fixed',
        bottom: '100px',
        right: '24px',
        width: '420px',
        height: '720px',
        maxHeight: 'calc(100vh - 120px)',
        backgroundColor: 'white',
        borderRadius: '2.5rem',
        boxShadow: '0 25px 50px -12px rgba(0, 0, 0, 0.25)',
        zIndex: '999999',
        overflow: 'hidden',
        display: 'none',
        opacity: '0',
        transform: 'translateY(20px)',
        transition: 'all 0.4s cubic-bezier(0.4, 0, 0.2, 1)',
        border: '1px solid rgba(0,0,0,0.05)'
    });

    const iframe = document.createElement('iframe');
    iframe.src = BOT_URL;
    Object.assign(iframe.style, {
        width: '100%',
        height: '100%',
        border: 'none',
    });

    container.appendChild(iframe);
    document.body.appendChild(trigger);
    document.body.appendChild(container);

    let isOpen = false;

    trigger.onclick = () => {
        isOpen = !isOpen;
        if (isOpen) {
            container.style.display = 'block';
            setTimeout(() => {
                container.style.opacity = '1';
                container.style.transform = 'translateY(0)';
            }, 10);
            trigger.style.transform = 'scale(0.9) rotate(90deg)';
            trigger.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>`;
        } else {
            container.style.opacity = '0';
            container.style.transform = 'translateY(20px)';
            setTimeout(() => {
                container.style.display = 'none';
            }, 400);
            trigger.style.transform = 'scale(1) rotate(0deg)';
            trigger.innerHTML = `<svg width="28" height="28" viewBox="0 0 24 24" fill="white"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10z"></path></svg>`;
        }
    };

    // Mobile Responsiveness for Embed
    const mediaQuery = window.matchMedia('(max-width: 480px)');
    function handleMobile(e) {
        if (e.matches) {
            container.style.width = '100vw';
            container.style.height = '100vh';
            container.style.maxHeight = '100vh';
            container.style.bottom = '0';
            container.style.right = '0';
            container.style.borderRadius = '0';
        } else {
            container.style.width = '420px';
            container.style.height = '720px';
            container.style.bottom = '100px';
            container.style.right = '24px';
            container.style.borderRadius = '2.5rem';
        }
    }
    mediaQuery.addListener(handleMobile);
    handleMobile(mediaQuery);

})();
