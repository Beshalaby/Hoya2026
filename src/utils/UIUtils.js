/**
 * UI Utilities for TrafiQ
 * Shared UI logic and components
 */

export const UIUtils = {
    /**
     * Setup custom dropdown behavior
     * @param {HTMLElement} wrapper - The wrapper element (.custom-select-wrapper) or document
     */
    setupCustomDropdowns(root = document) {
        const wrappers = root.querySelectorAll('.custom-select-wrapper');

        wrappers.forEach(wrapper => {
            const customSelect = wrapper.querySelector('.custom-select');
            const trigger = customSelect?.querySelector('.custom-select__trigger');
            const hiddenSelect = wrapper.querySelector('select');
            const valueDisplay = wrapper.querySelector('.custom-select__trigger span');
            
            if (!customSelect || !trigger) return;

            // Toggle dropdown
            trigger.addEventListener('click', (e) => {
                e.stopPropagation();
                // Close others
                document.querySelectorAll('.custom-select.open').forEach(el => {
                    if (el !== customSelect) el.classList.remove('open');
                });
                customSelect.classList.toggle('open');
            });

            // Handle option selection delegate
            customSelect.addEventListener('click', (e) => {
                const option = e.target.closest('.custom-option');
                if (!option) return;

                const value = option.dataset.value;
                const text = option.textContent;

                // Update UI
                if (valueDisplay) valueDisplay.textContent = text;
                
                // Update active state
                customSelect.querySelectorAll('.custom-option').forEach(opt => opt.classList.remove('selected'));
                option.classList.add('selected');

                // Close dropdown
                customSelect.classList.remove('open');

                // Update hidden select and trigger change event
                if (hiddenSelect) {
                    hiddenSelect.value = value;
                    hiddenSelect.dispatchEvent(new Event('change', { bubbles: true }));
                }
            });
        });

        // Close when clicking outside
        document.addEventListener('click', (e) => {
            if (!e.target.closest('.custom-select')) {
                document.querySelectorAll('.custom-select.open').forEach(el => el.classList.remove('open'));
            }
        });
    },

    /**
     * Sync custom dropdown options from native select
     * @param {string} wrapperId - ID of the wrapper or select element
     */
    updateCustomDropdownOptions(wrapperElement) {
        if (!wrapperElement) return;

        const hiddenSelect = wrapperElement.querySelector('select');
        const customOptionsContainer = wrapperElement.querySelector('.custom-select__options');
        const valueDisplay = wrapperElement.querySelector('.custom-select__trigger span');

        if (!hiddenSelect || !customOptionsContainer) return;

        // Clear existing
        customOptionsContainer.innerHTML = '';

        // Rebuild from select options
        Array.from(hiddenSelect.options).forEach(opt => {
            const span = document.createElement('span');
            span.className = `custom-option ${opt.selected ? 'selected' : ''}`;
            span.dataset.value = opt.value;
            span.textContent = opt.textContent;
            customOptionsContainer.appendChild(span);

            if (opt.selected && valueDisplay) {
                valueDisplay.textContent = opt.textContent;
            }
        });
    }
};
