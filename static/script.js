// Global variables
let currentSettings = {};
let albums = [];
let selectedImageId = null;
let contextMenuVisible = false;

// Initialize the application
document.addEventListener('DOMContentLoaded', function() {
    initializeRangeDisplays();
    setupEventListeners();
    loadSettings();
    loadAlbums();
    loadImageGallery();
    updateStatusBar();
    testConnection();
    
    // Auto-refresh status every 5 seconds for better responsiveness
    setInterval(updateStatusBar, 5000);
    
    // Close context menu on outside click
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.context-menu')) {
            hideContextMenu();
        }
    });
    
    // Prevent context menu on right click (we'll handle it ourselves)
    document.addEventListener('contextmenu', function(e) {
        if (e.target.closest('.image-item')) {
            e.preventDefault();
        }
    });
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

// Format file size
function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

// Format date
function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleDateString() + ' ' + date.toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'});
}

// Load albums
function loadAlbums() {
    fetch('/albums')
        .then(response => response.json())
        .then(data => {
            albums = data;
            populateAlbumSelects();
            populateAlbumList();
        })
        .catch(error => console.error('Error loading albums:', error));
}

// Populate album select elements
function populateAlbumSelects() {
    const selects = ['uploadAlbumSelect', 'urlAlbumSelect', 'cycleAlbumSelect', 'galleryAlbumSelect', 'moveToAlbumSelect'];
    
    selects.forEach(selectId => {
        const select = document.getElementById(selectId);
        if (!select) return;
        
        select.innerHTML = '';
        
        // Add "All Images" option for gallery filter
        if (selectId === 'galleryAlbumSelect') {
            select.innerHTML = '<option value="">All Images</option>';
        }
        
        albums.forEach(album => {
            const option = document.createElement('option');
            option.value = album.id;
            option.textContent = album.name;
            select.appendChild(option);
        });
    });
}

// Populate album list in management section
function populateAlbumList() {
    const albumList = document.getElementById('albumList');
    if (!albumList) return;
    
    albumList.innerHTML = '';
    
    albums.forEach(album => {
        const albumItem = document.createElement('div');
        albumItem.className = 'album-item';
        
        const imageCount = album.image_count || 0;
        
        albumItem.innerHTML = `
            <div class="album-info">
                <h4>${album.name}</h4>
                ${album.description ? `<p>${album.description}</p>` : ''}
                <div class="album-stats">${imageCount} images • Created ${formatDate(album.created_at)}</div>
            </div>
            <div class="album-actions">
                ${album.id !== 1 ? `<button class="danger" onclick="deleteAlbum(${album.id})">Delete Album</button>` : ''}
            </div>
        `;
        
        albumList.appendChild(albumItem);
    });
}

// Create new album
function createAlbum() {
    const nameInput = document.getElementById('newAlbumName');
    const descriptionInput = document.getElementById('newAlbumDescription');
    
    const name = nameInput.value.trim();
    const description = descriptionInput.value.trim();
    
    if (!name) {
        showStatus('Album name is required', 'error');
        return;
    }
    
    showStatus('Creating album...', 'loading');
    
    fetch('/albums', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ name, description })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showStatus(data.message, 'success');
            nameInput.value = '';
            descriptionInput.value = '';
            loadAlbums();
        } else {
            showStatus(data.error, 'error');
        }
    })
    .catch(error => {
        showStatus('Error creating album: ' + error.message, 'error');
    });
}

// Delete album
function deleteAlbum(albumId) {
    if (!confirm('Are you sure you want to delete this album? Images will be moved to "All Images".')) {
        return;
    }
    
    showStatus('Deleting album...', 'loading');
    
    fetch(`/albums/${albumId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showStatus(data.message, 'success');
            loadAlbums();
            loadImageGallery();
        } else {
            showStatus(data.error, 'error');
        }
    })
    .catch(error => {
        showStatus('Error deleting album: ' + error.message, 'error');
    });
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
            
            // Update status based on current mode
            if (data.cycling_active) {
                indicator.className = 'status-indicator status-active';
                const albumInfo = data.current_album_name || 'All Images';
                const progressInfo = data.total_album_images > 0 ?
                    ` (${data.current_image_index}/${data.total_album_images})` : '';
                text.innerHTML = `Cycling Mode: ${albumInfo}${progressInfo}<br>
                    <small>${data.cycle_time}s intervals • ${data.saturation} saturation</small>`;
            } else if (data.ai_mode_active) {
                indicator.className = 'status-indicator status-active';
                text.innerHTML = `AI Generation Mode Active<br>
                    <small>${Math.floor(data.ai_generation_interval/60)}min intervals • ${data.saturation} saturation</small>`;
            } else {
                indicator.className = 'status-indicator status-inactive';
                text.innerHTML = `Manual Mode<br>
                    <small>${data.saturation} saturation</small>`;
            }
            
            // Update button states
            const startCycleBtn = document.getElementById('startCycleBtn');
            const startAiBtn = document.getElementById('startAiBtn');
            const stopModesBtn = document.getElementById('stopModesBtn');
            
            if (startCycleBtn) startCycleBtn.disabled = data.cycling_active;
            if (startAiBtn) startAiBtn.disabled = data.ai_mode_active;
            if (stopModesBtn) stopModesBtn.disabled = !data.cycling_active && !data.ai_mode_active;
            
            // Update settings display
            currentSettings = data.settings;
            updateSettingsDisplay(data);
        })
        .catch(error => console.error('Error updating status:', error));
}

// Update settings display with current values
function updateSettingsDisplay(statusData) {
    const cycleTime = document.getElementById('cycleTime');
    const aiInterval = document.getElementById('aiInterval');
    const globalSaturation = document.getElementById('globalSaturation');
    const globalSaturationValue = document.getElementById('globalSaturationValue');
    const cycleAlbumSelect = document.getElementById('cycleAlbumSelect');
    
    if (cycleTime) cycleTime.value = statusData.cycle_time || 30;
    if (aiInterval) aiInterval.value = statusData.ai_generation_interval || 300;
    if (globalSaturation) globalSaturation.value = statusData.saturation || 0.5;
    if (globalSaturationValue) globalSaturationValue.textContent = statusData.saturation || 0.5;
    if (cycleAlbumSelect && statusData.settings && statusData.settings.current_album) {
        cycleAlbumSelect.value = statusData.settings.current_album;
    }
}

// Load application settings
function loadSettings() {
    fetch('/settings')
        .then(response => response.json())
        .then(settings => {
            currentSettings = settings;
            updateSettingsDisplay({ 
                cycle_time: settings.cycle_time,
                ai_generation_interval: settings.ai_generation_interval,
                saturation: settings.saturation,
                settings: settings
            });
        })
        .catch(error => console.error('Error loading settings:', error));
}

// Load and display image gallery
function loadImageGallery() {
    const albumSelect = document.getElementById('galleryAlbumSelect');
    const albumId = albumSelect ? albumSelect.value : '';
    
    const url = albumId ? `/albums/${albumId}/images` : '/images';
    
    fetch(url)
        .then(response => response.json())
        .then(images => {
            const gallery = document.getElementById('imageGallery');
            if (!gallery) return;
            
            gallery.innerHTML = '';
            
            if (images.length === 0) {
                gallery.innerHTML = '<p style="text-align: center; color: #666; grid-column: 1 / -1;">No images found. Upload some images to get started!</p>';
                return;
            }
            
            images.forEach(image => {
                const imageItem = document.createElement('div');
                imageItem.className = 'image-item';
                imageItem.dataset.imageId = image.id;
                
                // Determine correct image source URL
                let imageSrc;
                if (image.filepath.includes('uploads')) {
                    imageSrc = `/uploads/${encodeURIComponent(image.filename)}`;
                } else if (image.filepath.includes('pictures')) {
                    imageSrc = `/pictures/${encodeURIComponent(image.filename)}`;
                } else {
                    // Fallback: try to determine from filepath
                    imageSrc = `/${image.filepath.replace(/\\/g, '/')}`;
                }
                
                imageItem.innerHTML = `
                    <div class="image-controls">
                        <button class="success" onclick="displayImageById(${image.id})" title="Display">Display</button>
                        <button class="secondary" onclick="showMoveImageModal(${image.id})" title="Move">Move</button>
                        <button class="danger" onclick="showDeleteModal(${image.id})" title="Delete">Delete</button>
                    </div>
                    <img src="${imageSrc}" alt="${image.filename}" onerror="this.style.display='none'">
                    <div class="image-info">
                        <div class="image-filename">${image.original_filename}</div>
                        ${image.album_name ? `<div class="image-album">${image.album_name}</div>` : ''}
                        <div class="image-meta">
                            <span>${image.file_size ? formatFileSize(image.file_size) : ''}</span>
                            <span>${formatDate(image.created_at)}</span>
                        </div>
                    </div>
                `;
                
                // Add click handler for display
                imageItem.addEventListener('click', (e) => {
                    if (!e.target.closest('.image-controls')) {
                        displayImageById(image.id);
                    }
                });
                
                // Add right-click context menu
                imageItem.addEventListener('contextmenu', (e) => {
                    e.preventDefault();
                    showContextMenu(e, image.id);
                });
                
                gallery.appendChild(imageItem);
            });
        })
        .catch(error => {
            console.error('Error loading gallery:', error);
            const gallery = document.getElementById('imageGallery');
            if (gallery) {
                gallery.innerHTML = '<p style="text-align: center; color: #ff0000; grid-column: 1 / -1;">Error loading images</p>';
            }
        });
}

// Display an image by ID
function displayImageById(imageId, saturation = null) {
    showStatus('Displaying image...', 'loading');
    
    const requestSaturation = saturation || currentSettings.saturation || 0.5;
    
    fetch(`/images/${imageId}/display`, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ saturation: requestSaturation })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showStatus(data.message, 'success');
        } else {
            showStatus(data.error, 'error');
        }
        updateStatusBar();
    })
    .catch(error => {
        showStatus('Error displaying image: ' + error.message, 'error');
    });
}

// Show context menu
function showContextMenu(event, imageId) {
    selectedImageId = imageId;
    const contextMenu = document.getElementById('imageContextMenu');
    
    contextMenu.style.display = 'block';
    contextMenu.style.left = event.pageX + 'px';
    contextMenu.style.top = event.pageY + 'px';
    
    contextMenuVisible = true;
    
    // Adjust position if menu goes off screen
    setTimeout(() => {
        const rect = contextMenu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            contextMenu.style.left = (event.pageX - rect.width) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            contextMenu.style.top = (event.pageY - rect.height) + 'px';
        }
    }, 0);
}

// Hide context menu
function hideContextMenu() {
    const contextMenu = document.getElementById('imageContextMenu');
    contextMenu.style.display = 'none';
    contextMenuVisible = false;
    selectedImageId = null;
}

// Show move image modal
function showMoveImageModal(imageId) {
    selectedImageId = imageId;
    const modal = document.getElementById('moveImageModal');
    modal.style.display = 'flex';
    hideContextMenu();
}

// Hide move image modal
function hideMoveImageModal() {
    const modal = document.getElementById('moveImageModal');
    modal.style.display = 'none';
    selectedImageId = null;
}

// Move image to album
function moveImageToAlbum() {
    if (!selectedImageId) return;
    
    const albumSelect = document.getElementById('moveToAlbumSelect');
    const albumId = parseInt(albumSelect.value);
    
    showStatus('Moving image...', 'loading');
    
    fetch(`/images/${selectedImageId}/album`, {
        method: 'PUT',
        headers: {
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ album_id: albumId })
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showStatus(data.message, 'success');
            loadImageGallery();
            hideMoveImageModal();
        } else {
            showStatus(data.error, 'error');
        }
    })
    .catch(error => {
        showStatus('Error moving image: ' + error.message, 'error');
    });
}

// Show delete confirmation modal
function showDeleteModal(imageId) {
    selectedImageId = imageId;
    const modal = document.getElementById('deleteModal');
    modal.style.display = 'flex';
    hideContextMenu();
}

// Hide delete confirmation modal
function hideDeleteModal() {
    const modal = document.getElementById('deleteModal');
    modal.style.display = 'none';
    selectedImageId = null;
}

// Delete image
function deleteImage() {
    if (!selectedImageId) return;
    
    showStatus('Deleting image...', 'loading');
    
    fetch(`/images/${selectedImageId}`, {
        method: 'DELETE'
    })
    .then(response => response.json())
    .then(data => {
        if (data.message) {
            showStatus(data.message, 'success');
            loadImageGallery();
            hideDeleteModal();
            updateStatusBar();
        } else {
            showStatus(data.error, 'error');
        }
    })
    .catch(error => {
        showStatus('Error deleting image: ' + error.message, 'error');
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
            const albumId = document.getElementById('uploadAlbumSelect').value;
            
            if (!fileInput.files[0]) {
                showStatus('Please select a file', 'error');
                return;
            }

            formData.append('file', fileInput.files[0]);
            formData.append('saturation', saturation);
            formData.append('album_id', albumId);
            
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
                    // Reset form
                    uploadForm.reset();
                    document.getElementById('preview').innerHTML = '';
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
            const albumId = document.getElementById('urlAlbumSelect').value;
            
            showStatus('Downloading and displaying image...', 'loading');
            
            try {
                const response = await fetch('/url', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ url, saturation, album_id: albumId })
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
                    // Reset form
                    urlForm.reset();
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
            const albumId = document.getElementById('cycleAlbumSelect').value;
            showStatus('Starting cycling mode...', 'loading');
            
            try {
                const response = await fetch('/start_cycle', { 
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                    },
                    body: JSON.stringify({ album_id: parseInt(albumId) })
                });
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
                saturation: parseFloat(document.getElementById('globalSaturation').value),
                current_album: parseInt(document.getElementById('cycleAlbumSelect').value)
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
                    updateStatusBar();
                } else {
                    showStatus(data.error || 'Failed to save settings', 'error');
                }
            } catch (error) {
                showStatus('Failed to save settings: ' + error.message, 'error');
            }
        });
    }

    // Album management
    const createAlbumBtn = document.getElementById('createAlbumBtn');
    if (createAlbumBtn) {
        createAlbumBtn.addEventListener('click', createAlbum);
    }

    // Gallery controls
    const refreshGalleryBtn = document.getElementById('refreshGalleryBtn');
    if (refreshGalleryBtn) {
        refreshGalleryBtn.addEventListener('click', function() {
            loadImageGallery();
            updateStatusBar();
        });
    }

    const galleryAlbumSelect = document.getElementById('galleryAlbumSelect');
    if (galleryAlbumSelect) {
        galleryAlbumSelect.addEventListener('change', loadImageGallery);
    }

    // Context menu handlers
    const displayImageBtn = document.getElementById('displayImageBtn');
    if (displayImageBtn) {
        displayImageBtn.addEventListener('click', function() {
            if (selectedImageId) {
                displayImageById(selectedImageId);
                hideContextMenu();
            }
        });
    }

    const moveImageBtn = document.getElementById('moveImageBtn');
    if (moveImageBtn) {
        moveImageBtn.addEventListener('click', function() {
            if (selectedImageId) {
                showMoveImageModal(selectedImageId);
            }
        });
    }

    const deleteImageBtn = document.getElementById('deleteImageBtn');
    if (deleteImageBtn) {
        deleteImageBtn.addEventListener('click', function() {
            if (selectedImageId) {
                showDeleteModal(selectedImageId);
            }
        });
    }

    // Modal handlers
    const confirmMoveBtn = document.getElementById('confirmMoveBtn');
    if (confirmMoveBtn) {
        confirmMoveBtn.addEventListener('click', moveImageToAlbum);
    }

    const cancelMoveBtn = document.getElementById('cancelMoveBtn');
    if (cancelMoveBtn) {
        cancelMoveBtn.addEventListener('click', hideMoveImageModal);
    }

    const confirmDeleteBtn = document.getElementById('confirmDeleteBtn');
    if (confirmDeleteBtn) {
        confirmDeleteBtn.addEventListener('click', deleteImage);
    }

    const cancelDeleteBtn = document.getElementById('cancelDeleteBtn');
    if (cancelDeleteBtn) {
        cancelDeleteBtn.addEventListener('click', hideDeleteModal);
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

    // Close modals when clicking outside
    window.addEventListener('click', function(event) {
        const moveModal = document.getElementById('moveImageModal');
        const deleteModal = document.getElementById('deleteModal');
        
        if (event.target === moveModal) {
            hideMoveImageModal();
        }
        if (event.target === deleteModal) {
            hideDeleteModal();
        }
    });
}