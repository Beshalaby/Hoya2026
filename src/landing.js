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
    };

    // Initial check
    handleScroll();

    // Listen for scroll events
    window.addEventListener('scroll', handleScroll, { passive: true });
});
