// Global variables
let currentSettings = {};

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeRangeDisplays();
    setupEventListeners();
    loadSettings();
    loadImageGallery();
    updateStatusBar();
    testConnection();
    
    // Auto-refresh status every 10 seconds
    setInterval(updateStatusBar, 10000);
});

// Initialize range input displays
function initializeRangeDisplays() {
    updateRangeDisplay('uploadSaturation', 'uploadSaturationValue');
    updateRangeDisplay('urlSaturation', 'urlSaturationValue');
    updateRangeDisplay('globalSaturation', 'globalSaturationValue');
}

// Update range value displays
function updateRangeDisplay(rangeId, displayId) {
    const range = document.getElementById(rangeId);
    const display = document.getElementById(displayId);
    
    if (range && display) {
        display.textContent = range.value;
        
        range.addEventListener('input', function() {
            display.textContent = this.value;
        });
    }
}

// Show status messages
function showStatus(message, type) {
    const status = document.getElementById('status');
    status.textContent = message;
    status.className = type;
    status.style.display = 'block';
    
    if (type !== 'loading') {
        setTimeout(() => {
            status.style.display = 'none';
        }, 5000);
    }
}

// Update status bar with current mode and image count
function updateStatusBar() {
    fetch('/status')
        .then(response => response.json())
        .then(data => {
            const indicator = document.getElementById('modeIndicator');
            const text = document.getElementById('modeText');
            const imageCount = document.getElementById('imageCount');
            
            imageCount.textContent = data.image_count;
            
            if (data.cycling_active) {
                indicator.className = 'status-indicator status-active';
                text.textContent = 'Cycling Mode Active';
            } else if (data.ai_mode_active) {
                indicator.className = 'status-indicator status-active';
                text.textContent = 'AI Generation Mode Active';
            } else {
                indicator.className = 'status-indicator status-inactive';
                text.textContent = 'Manual Mode';
            }
            
            // Update button states
            const startCycleBtn = document.getElementById('startCycleBtn');
            const startAiBtn = document.getElementById('startAiBtn');
            const stopModesBtn = document.getElementById('stopModesBtn');
            
            if (startCycleBtn) startCycleBtn.disabled = data.cycling_active;
            if (startAiBtn) startAiBtn.disabled = data.ai_mode_active;
            if (stopModesBtn) stopModesBtn.disabled = !data.cycling_active && !data.ai_mode_active;
        })
        .catch(error => console.error('Error updating status:', error));
}

// Load application settings
function loadSettings() {
    fetch('/settings')
        .then(response => response.json())
        .then(settings => {
            currentSettings = settings;
            
            const cycleTime = document.getElementById('cycleTime');
            const aiInterval = document.getElementById('aiInterval');
            const globalSaturation = document.getElementById('globalSaturation');
            const globalSaturationValue = document.getElementById('globalSaturationValue');
            
            if (cycleTime) cycleTime.value = settings.cycle_time;
            if (aiInterval) aiInterval.value = settings.ai_generation_interval;
            if (globalSaturation) globalSaturation.value = settings.saturation;
            if (globalSaturationValue) globalSaturationValue.textContent = settings.saturation;
        })
        .catch(error => console.error('Error loading settings:', error));
}

// Load and display image gallery
function loadImageGallery() {
    fetch('/images')
        .then(response => response.json())
        .then(images => {
            const gallery = document.getElementById('imageGallery');
            if (!gallery) return;
            
            gallery.innerHTML = '';
            
            if (images.length === 0) {
                gallery.innerHTML = '<p style="text-align: center; color: #666;">No images found. Upload some images to get started!</p>';
                return;
            }
            
            images.forEach(image => {
                const imageItem = document.createElement('div');
                imageItem.className = 'image-item';
                imageItem.innerHTML = `
                    <img src="/${image.folder}/${image.filename}" alt="${image.filename}" onerror="this.src='data:image/svg+xml,<svg xmlns=\"http://www.w3.org/2000/svg\" width=\"100\" height=\"100\"><rect width=\"100\" height=\"100\" fill=\"%23f0f0f0\"/><text x=\"50\" y=\"50\" text-anchor=\"middle\" dy=\".3em\" fill=\"%23999\">No Preview</text></svg>'">
                    <div class="filename">${image.filename}</div>
                `;
                
                imageItem.addEventListener('click', () => {
                    displayImageFromGallery(image.folder, image.filename);
                });
                
                gallery.appendChild(imageItem);
            });
        })
        .catch(error => {
            console.error('Error loading gallery:', error);
            const gallery = document.getElementById('imageGallery');
            if (gallery) {
                gallery.innerHTML = '<p style="text-align: center; color: #ff0000;">Error loading images</p>';
            }
        });
}

// Display an image from the gallery
function displayImageFromGallery(folder, filename) {
    showStatus('Displaying image from gallery...', 'loading');
    
    fetch('/url', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ 
            url: `${window.location.origin}/${folder}/${filename}`,
            saturation: currentSettings.saturation || 0.5
        })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showStatus(`Displayed: ${filename}`, 'success');
        } else {
            showStatus(data.error, 'error');
        }
        updateStatusBar();
    })
    .catch(error => {
        showStatus('Error displaying image: ' + error.message, 'error');
    });
}

// Show image preview
function showImagePreview(file) {
    const preview = document.getElementById('preview');
    if (!preview) return;
    
    const reader = new FileReader();
    
    reader.onload = function(e) {
        preview.innerHTML = '<img src="' + e.target.result + '" class="preview" alt="Preview">';
    };
    
    reader.readAsDataURL(file);
}

// Test device connection
function testConnection() {
    showStatus('Testing connection...', 'loading');
    
    fetch('/test')
        .then(response => response.json())
        .then(data => {
            if (data.message) {
                showStatus(data.message, 'success');
                // Show device info
                const resolution = document.getElementById('resolution');
                const deviceInfo = document.getElementById('deviceInfo');
                
                if (resolution) resolution.textContent = data.width + 'x' + data.height;
                if (deviceInfo) deviceInfo.style.display = 'block';
            } else {
                showStatus(data.error, 'error');
                const deviceInfo = document.getElementById('deviceInfo');
                if (deviceInfo) deviceInfo.style.display = 'none';
            }
        })
        .catch(error => {
            showStatus('Connection test failed: ' + error.message, 'error');
            const deviceInfo = document.getElementById('deviceInfo');
            if (deviceInfo) deviceInfo.style.display = 'none';
        });
}

// Setup all event listeners
function setupEventListeners() {
    // Upload form handler
    const uploadForm = document.getElementById('uploadForm');
    if (uploadForm) {
        uploadForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const formData = new FormData();
            const fileInput = document.getElementById('file');
            const saturation = document.getElementById('uploadSaturation').value;
            
            if (!fileInput.files[0]) {
                showStatus('Please select a file', 'error');
                return;
            }

            formData.append('file', fileInput.files[0]);
            formData.append('saturation', saturation);
            
            showImagePreview(fileInput.files[0]);
            showStatus('Uploading and displaying image...', 'loading');
            
            try {
                const response = await fetch('/upload', {
                    method: 'POST',
                    body: formData
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                    loadImageGallery();
                    updateStatusBar();
                } else {
                    showStatus(data.error, 'error');
                }
            } catch (error) {
                showStatus('Upload failed: ' + error.message, 'error');
            }
        });
    }

    // URL form handler
    const urlForm = document.getElementById('urlForm');
    if (urlForm) {
        urlForm.addEventListener('submit', async function(e) {
            e.preventDefault();
            
            const url = document.getElementById('imageUrl').value;
            const saturation = document.getElementById('urlSaturation').value;
            
            showStatus('Downloading and displaying image...', 'loading');
            
            try {
                const response = await fetch('/url', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url, saturation })
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                    loadImageGallery();
                    updateStatusBar();
                    // Show preview
                    const preview = document.getElementById('preview');
                    if (preview) {
                        preview.innerHTML = '<img src="' + url + '" class="preview" alt="Downloaded image">';
                    }
                } else {
                    showStatus(data.error, 'error');
                }
            } catch (error) {
                showStatus('Download failed: ' + error.message, 'error');
            }
        });
    }

    // Mode control buttons
    const startCycleBtn = document.getElementById('startCycleBtn');
    if (startCycleBtn) {
        startCycleBtn.addEventListener('click', async function() {
            showStatus('Starting cycling mode...', 'loading');
            
            try {
                const response = await fetch('/start_cycle', { method: 'POST' });
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                } else {
                    showStatus(data.error, 'error');
                }
                updateStatusBar();
            } catch (error) {
                showStatus('Failed to start cycling: ' + error.message, 'error');
            }
        });
    }

    const startAiBtn = document.getElementById('startAiBtn');
    if (startAiBtn) {
        startAiBtn.addEventListener('click', async function() {
            showStatus('Starting AI generation mode...', 'loading');
            
            try {
                const response = await fetch('/start_ai', { method: 'POST' });
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                } else {
                    showStatus(data.error, 'error');
                }
                updateStatusBar();
            } catch (error) {
                showStatus('Failed to start AI mode: ' + error.message, 'error');
            }
        });
    }

    const stopModesBtn = document.getElementById('stopModesBtn');
    if (stopModesBtn) {
        stopModesBtn.addEventListener('click', async function() {
            showStatus('Stopping all modes...', 'loading');
            
            try {
                const response = await fetch('/stop_modes', { method: 'POST' });
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                } else {
                    showStatus(data.error, 'error');
                }
                updateStatusBar();
            } catch (error) {
                showStatus('Failed to stop modes: ' + error.message, 'error');
            }
        });
    }

    // Settings save button
    const saveSettingsBtn = document.getElementById('saveSettingsBtn');
    if (saveSettingsBtn) {
        saveSettingsBtn.addEventListener('click', async function() {
            const settings = {
                cycle_time: parseInt(document.getElementById('cycleTime').value),
                ai_generation_interval: parseInt(document.getElementById('aiInterval').value),
                saturation: parseFloat(document.getElementById('globalSaturation').value)
            };
            
            showStatus('Saving settings...', 'loading');
            
            try {
                const response = await fetch('/settings', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify(settings)
                });
                
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                    loadSettings();
                } else {
                    showStatus(data.error || 'Failed to save settings', 'error');
                }
            } catch (error) {
                showStatus('Failed to save settings: ' + error.message, 'error');
            }
        });
    }

    // Gallery refresh button
    const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');
    if (refreshGalleryBtn) {
        refreshGalleryBtn.addEventListener('click', function() {
            loadImageGallery();
            updateStatusBar();
        });
    }

    // Test connection button
    const testBtn = document.getElementById('testBtn');
    if (testBtn) {
        testBtn.addEventListener('click', testConnection);
    }

    // Clear display button
    const clearBtn = document.getElementById('clearBtn');
    if (clearBtn) {
        clearBtn.addEventListener('click', async function() {
            showStatus('Clearing display...', 'loading');
            
            try {
                const response = await fetch('/clear', { method: 'POST' });
                const data = await response.json();
                
                if (response.ok) {
                    showStatus(data.message, 'success');
                    const preview = document.getElementById('preview');
                    if (preview) preview.innerHTML = '';
                    updateStatusBar();
                } else {
                    showStatus(data.error, 'error');
                }
            } catch (error) {
                showStatus('Clear failed: ' + error.message, 'error');
            }
        });
    }
}