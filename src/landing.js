/**
 * Landing Page Interactions
 * Handles scroll effects for immersive experience
 */
document.addEventListener('DOMContentLoaded', () => {
    const handleScroll = () => {
        // Toggle 'scrolled' class based on scroll position
        if (window.scrollY > 20) {
            document.body.classList.add('scrolled');
        } else {
            document.body.classList.remove('scrolled');
        }

        // Parallax Effect for Hero Overlay
        const heroOverlay = document.querySelector('.hero__overlay');
        if (heroOverlay) {
            const scrollValue = window.scrollY;
            // Move background at 50% speed of scroll
            heroOverlay.style.transform = `translateY(${scrollValue * 0.5}px)`;
        }
    };

    // Initial check
    handleScroll();

    // Listen for scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });
});
