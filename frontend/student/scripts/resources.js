// Current user information
const currentUser = {
  id: "user_dane_pascual",
  name: "DanePascual",
  initials: "DP",
  role: "BSIT Student",
};

// Current session information - UPDATED to match current time
const CURRENT_SESSION = {
  utcTime: "2025-08-31 03:48:29", // UTC time from your input
  user: "DanePascual",
  timezone: "UTC",
};

// Theme management
function initializeTheme() {
  const themeToggle = document.getElementById("themeToggle");
  const body = document.body;

  // Load saved theme from localStorage
  const savedTheme = localStorage.getItem("theme") || "light";
  if (savedTheme === "dark") {
    body.classList.add("dark-mode");
    themeToggle.innerHTML = '<i class="bi bi-sun"></i>';
  }

  // Add toggle event
  themeToggle.addEventListener("click", () => {
    body.classList.toggle("dark-mode");
    const isDark = body.classList.contains("dark-mode");
    themeToggle.innerHTML = isDark
      ? '<i class="bi bi-sun"></i>'
      : '<i class="bi bi-moon"></i>';
    localStorage.setItem("theme", isDark ? "dark" : "light");
  });
}

// File type configuration
const fileTypes = {
  pdf: {
    icon: "bi-file-earmark-pdf",
    color: "#f44336",
    image:
      "data:image/svg+xml;utf8,<svg width='70' height='70' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='70' height='70' rx='12' ry='12' fill='%23f44336'/><text x='50%' y='55%' font-size='24' font-family='Arial' fill='white' text-anchor='middle' alignment-baseline='middle'>PDF</text></svg>",
  },
  docx: {
    icon: "bi-file-earmark-word",
    color: "#2196f3",
    image:
      "data:image/svg+xml;utf8,<svg width='70' height='70' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='70' height='70' rx='12' ry='12' fill='%232196f3'/><text x='50%' y='55%' font-size='22' font-family='Arial' fill='white' text-anchor='middle' alignment-baseline='middle'>DOC</text></svg>",
  },
  doc: {
    icon: "bi-file-earmark-word",
    color: "#2196f3",
    image:
      "data:image/svg+xml;utf8,<svg width='70' height='70' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='70' height='70' rx='12' ry='12' fill='%232196f3'/><text x='50%' y='55%' font-size='22' font-family='Arial' fill='white' text-anchor='middle' alignment-baseline='middle'>DOC</text></svg>",
  },
  ppt: {
    icon: "bi-file-earmark-slides",
    color: "#ff9800",
    image:
      "data:image/svg+xml;utf8,<svg width='70' height='70' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='70' height='70' rx='12' ry='12' fill='%23ff9800'/><text x='50%' y='55%' font-size='22' font-family='Arial' fill='white' text-anchor='middle' alignment-baseline='middle'>PPT</text></svg>",
  },
  pptx: {
    icon: "bi-file-earmark-slides",
    color: "#ff9800",
    image:
      "data:image/svg+xml;utf8,<svg width='70' height='70' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='70' height='70' rx='12' ry='12' fill='%23ff9800'/><text x='50%' y='55%' font-size='22' font-family='Arial' fill='white' text-anchor='middle' alignment-baseline='middle'>PPT</text></svg>",
  },
  default: {
    icon: "bi-file-earmark",
    color: "#607d8b",
    image:
      "data:image/svg+xml;utf8,<svg width='70' height='70' xmlns='http://www.w3.org/2000/svg'><rect x='0' y='0' width='70' height='70' rx='12' ry='12' fill='%23607d8b'/><text x='50%' y='55%' font-size='22' font-family='Arial' fill='white' text-anchor='middle' alignment-baseline='middle'>FILE</text></svg>",
  },
};

// Get file type details
function getFileTypeInfo(filename) {
  if (!filename) return fileTypes.default;
  const extension = filename.split(".").pop().toLowerCase();
  return fileTypes[extension] || fileTypes.default;
}

// Function to get file icon based on type
function getResourceImage(res) {
  if (res.coverImage) return res.coverImage;
  const typeKey = res.type.toLowerCase();
  return fileTypes[typeKey]?.image || fileTypes.default.image;
}

// Sample resources data
// Load resources from localStorage or start with empty arrays
let sampleResources = JSON.parse(
  localStorage.getItem("resources_data") || "[]"
);
let sampleFiles = JSON.parse(localStorage.getItem("files_data") || "[]");

// Initialize with empty arrays if first time loading
if (!localStorage.getItem("resources_data_initialized")) {
  // This flag ensures we don't re-initialize when the page reloads
  localStorage.setItem("resources_data_initialized", "true");
  localStorage.setItem("resources_data", JSON.stringify([]));
  localStorage.setItem("files_data", JSON.stringify([]));
}

// Store current state
const state = {
  currentView: "grid", // 'grid' or 'list'
  currentType: "all", // 'all', 'pdf', 'docx', 'ppt'
  currentSort: "newest",
  currentSort: "newest", // sorting method
  currentSearch: "", // search term
  tableSort: "newest", // table sorting method
  favorites: [], // IDs of favorited resources
};

// Load user data
function loadUserData() {
  document.getElementById("userAvatar").textContent = currentUser.initials;
  document.getElementById("userName").textContent = currentUser.name;

  // Load favorites from localStorage
  try {
    const savedFavorites =
      JSON.parse(localStorage.getItem(`favorites_${currentUser.id}`)) || [];
    state.favorites = savedFavorites;
  } catch (e) {
    console.error("Error loading favorites:", e);
    state.favorites = [];
  }
}

// Format date string to readable format
function formatDate(dateString) {
  const date = new Date(dateString);
  const options = { year: "numeric", month: "short", day: "numeric" };
  return date.toLocaleDateString(undefined, options);
}

// Format relative time for recent uploads
function formatRelativeTime(dateString) {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now - date;
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays} days ago`;

  return formatDate(dateString);
}

// Render resources in grid view
function renderResourcesGrid(filteredResources) {
  const grid = document.getElementById("resourcesGrid");
  grid.innerHTML = "";

  if (filteredResources.length === 0) {
    grid.innerHTML = `
      <div class="empty-state">
        <div class="empty-state-icon"><i class="bi bi-folder2-open"></i></div>
        <div class="empty-state-text">No resources found</div>
        <button class="upload-btn" onclick="openUploadModal()">
          <i class="bi bi-upload"></i> Upload a Resource
        </button>
      </div>
    `;
    return;
  }

  filteredResources.forEach((res) => {
    const isFavorited = state.favorites.includes(res.id);
    const isOwnResource = res.userId === currentUser.id;
    const typeInfo = getFileTypeInfo(res.title + "." + res.type);

    grid.innerHTML += `
      <div class="resource-card" data-id="${res.id}">
        <div class="resource-card-header">
          <img src="${getResourceImage(
            res
          )}" class="resource-card-img lazy-image" alt="" loading="lazy" />
          <div class="resource-type-badge">
            <i class="bi ${typeInfo.icon}"></i> ${res.type.toUpperCase()}
          </div>
          <div class="resource-actions">
            <button class="resource-action-btn favorite-btn ${
              isFavorited ? "active" : ""
            }" 
                    onclick="toggleFavorite('${res.id}')" aria-label="${
      isFavorited ? "Remove from favorites" : "Add to favorites"
    }">
              <i class="bi ${
                isFavorited ? "bi-bookmark-fill" : "bi-bookmark"
              }"></i>
            </button>
            ${
              isOwnResource
                ? `
                            <button class="resource-action-btn" onclick="editResource('${res.id}')" aria-label="Edit resource">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="resource-action-btn" onclick="confirmDeleteResource('${res.id}')" aria-label="Delete resource">
                <i class="bi bi-trash"></i>
              </button>
            `
                : ""
            }
          </div>
        </div>
        <div class="resource-card-body">
          <h3 class="resource-card-title">${res.title}</h3>
          <div class="resource-card-tags">
            ${res.tags
              .map((tag) => `<span class="resource-card-tag">${tag}</span>`)
              .join("")}
          </div>
          <div class="resource-card-desc">${res.desc}</div>
          <div class="resource-stats">
            <div class="resource-stat"><i class="bi bi-download"></i> ${
              res.downloads
            }</div>
            <div class="resource-stat"><i class="bi bi-eye"></i> ${
              res.views
            }</div>
          </div>
          <a href="${
            res.url
          }" class="resource-download-btn" download title="Download">
            <i class="bi bi-download"></i> Download
          </a>
          <div class="resource-card-footer">
            <span class="resource-card-by">
              <i class="bi bi-person"></i> ${res.by}
            </span>
            <span class="resource-card-date">${formatRelativeTime(
              res.date
            )}</span>
          </div>
        </div>
      </div>
    `;
  });

  // Initialize lazy loading
  initLazyLoading();
}

// Render resources in list view
function renderResourcesList(filteredResources) {
  const list = document.getElementById("resourcesList");
  list.innerHTML = "";

  if (filteredResources.length === 0) {
    list.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon"><i class="bi bi-folder2-open"></i></div>
          <div class="empty-state-text">No resources found</div>
          <button class="upload-btn" onclick="openUploadModal()">
            <i class="bi bi-upload"></i> Upload a Resource
          </button>
        </div>
      `;
    return;
  }

  filteredResources.forEach((res) => {
    const isFavorited = state.favorites.includes(res.id);
    const isOwnResource = res.userId === currentUser.id;
    const typeInfo = getFileTypeInfo(res.title + "." + res.type);

    list.innerHTML += `
        <div class="resource-list-item" data-id="${res.id}">
          <div class="resource-list-icon">
            <i class="bi ${typeInfo.icon}"></i>
          </div>
          <div class="resource-list-info">
            <div class="resource-list-title">${res.title}</div>
            <div class="resource-list-meta">
              <span><i class="bi bi-person"></i> ${res.by}</span>
              <span><i class="bi bi-calendar3"></i> ${formatRelativeTime(
                res.date
              )}</span>
              <span><i class="bi bi-download"></i> ${
                res.downloads
              } downloads</span>
            </div>
            <div class="resource-list-tags">
              ${res.tags
                .slice(0, 3)
                .map((tag) => `<span class="resource-list-tag">${tag}</span>`)
                .join("")}
            </div>
          </div>
          <div class="resource-list-actions">
            <button class="resource-list-btn favorite-btn ${
              isFavorited ? "active" : ""
            }" 
                    onclick="toggleFavorite('${res.id}')" title="${
      isFavorited ? "Remove from favorites" : "Add to favorites"
    }">
              <i class="bi ${
                isFavorited ? "bi-bookmark-fill" : "bi-bookmark"
              }"></i>
            </button>
            <a href="${
              res.url
            }" class="resource-list-btn" download title="Download">
              <i class="bi bi-download"></i>
            </a>
            ${
              isOwnResource
                ? `
              <button class="resource-list-btn" onclick="editResource('${res.id}')" title="Edit resource">
                <i class="bi bi-pencil"></i>
              </button>
              <button class="resource-list-btn" onclick="confirmDeleteResource('${res.id}')" title="Delete resource">
                <i class="bi bi-trash"></i>
              </button>
            `
                : ""
            }
          </div>
        </div>
      `;
  });
}

// Render files table
function renderFilesTable(sort = state.tableSort) {
  const tbody = document.getElementById("resourcesTable");
  tbody.innerHTML = "";

  // Create a copy of files and sort
  let files = [...sampleFiles];

  switch (sort) {
    case "newest":
      files.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "name-asc":
      files.sort((a, b) => a.name.localeCompare(b.name));
      break;
    case "size":
      files.sort((a, b) => {
        const sizeA = parseFloat(a.size);
        const sizeB = parseFloat(b.size);
        return sizeB - sizeA;
      });
      break;
  }

  if (files.length === 0) {
    tbody.innerHTML = `<tr><td colspan="6" class="text-center text-muted">No files found</td></tr>`;
    return;
  }

  files.forEach((file, index) => {
    const fileTypeInfo = getFileTypeInfo(file.name);
    const fileType = file.type.toLowerCase();
    const isOwnFile = file.userId === currentUser.id;

    tbody.innerHTML += `
        <tr data-id="${file.id}">
          <td data-label="Name" class="file-type-cell">
            <div class="file-icon ${fileType}" style="background-color:${
      fileTypeInfo.color
    }">${file.type}</div>
            ${file.name}
          </td>
          <td data-label="Uploaded By">${file.by}</td>
          <td data-label="Date">${formatRelativeTime(file.date)}</td>
          <td data-label="Type">${file.type}</td>
          <td data-label="Size">${file.size}</td>
          <td data-label="Actions">
            <div class="d-flex gap-2">
              <a href="${
                file.url
              }" class="download-btn" download title="Download">
                <i class="bi bi-download"></i>
              </a>
              ${
                isOwnFile
                  ? `
                <button class="download-btn" onclick="confirmDeleteFile('${file.id}')" title="Delete file">
                  <i class="bi bi-trash"></i>
                </button>
              `
                  : ""
              }
            </div>
          </td>
        </tr>
      `;
  });
}

// Filter resources based on type and search term
function filterResources(e) {
  if (e) {
    document.querySelectorAll(".resource-filter-btn").forEach((btn) => {
      btn.classList.remove("active");
    });
    e.target.classList.add("active");
    state.currentType = e.target.getAttribute("data-type");
  }

  applyFiltersAndSort();
}

// Apply current filters and sorting
function applyFiltersAndSort() {
  const searchTerm = state.currentSearch.toLowerCase();

  // Filter resources
  let filtered = sampleResources.filter((res) => {
    const matchType =
      state.currentType === "all" ? true : res.type === state.currentType;
    const matchSearch =
      searchTerm.length === 0 ||
      res.title.toLowerCase().includes(searchTerm) ||
      res.desc.toLowerCase().includes(searchTerm) ||
      res.tags.some((tag) => tag.toLowerCase().includes(searchTerm));

    return matchType && matchSearch;
  });

  // Apply sorting
  switch (state.currentSort) {
    case "newest":
      filtered.sort((a, b) => new Date(b.date) - new Date(a.date));
      break;
    case "oldest":
      filtered.sort((a, b) => new Date(a.date) - new Date(b.date));
      break;
    case "name-asc":
      filtered.sort((a, b) => a.title.localeCompare(b.title));
      break;
    case "name-desc":
      filtered.sort((a, b) => b.title.localeCompare(a.title));
      break;
    case "popular":
      filtered.sort((a, b) => b.downloads - a.downloads);
      break;
  }

  // Update the view based on current view mode
  if (state.currentView === "grid") {
    document.getElementById("resourcesGrid").style.display = "grid";
    document.getElementById("resourcesList").style.display = "none";
    renderResourcesGrid(filtered);
  } else {
    document.getElementById("resourcesGrid").style.display = "none";
    document.getElementById("resourcesList").style.display = "block";
    renderResourcesList(filtered);
  }
}

// Toggle between grid and list view
function setViewMode(mode) {
  const gridBtn = document.getElementById("gridViewBtn");
  const listBtn = document.getElementById("listViewBtn");

  if (mode === "grid") {
    gridBtn.classList.add("active");
    listBtn.classList.remove("active");
    state.currentView = "grid";
  } else {
    gridBtn.classList.remove("active");
    listBtn.classList.add("active");
    state.currentView = "list";
  }

  applyFiltersAndSort();
}

// Toggle favorite status for a resource
function toggleFavorite(resourceId) {
  const index = state.favorites.indexOf(resourceId);

  if (index === -1) {
    // Add to favorites
    state.favorites.push(resourceId);
    showToast("Resource added to favorites", "success");
  } else {
    // Remove from favorites
    state.favorites.splice(index, 1);
    showToast("Resource removed from favorites", "success");
  }

  // Save to localStorage
  localStorage.setItem(
    `favorites_${currentUser.id}`,
    JSON.stringify(state.favorites)
  );

  // Update UI
  applyFiltersAndSort();
}

// Edit resource
function editResource(resourceId) {
  const resource = sampleResources.find((r) => r.id === resourceId);
  if (!resource) return;

  openUploadModal();

  // Fill form with resource data
  document.getElementById("resourceTitle").value = resource.title;
  document.getElementById("resourceDesc").value = resource.desc;

  // Select tags
  document.querySelectorAll(".tag-option").forEach((tagOption) => {
    const tag = tagOption.getAttribute("data-tag");
    if (resource.tags.map((t) => t.toLowerCase()).includes(tag.toLowerCase())) {
      tagOption.classList.add("selected");
    }
  });

  // Store that we're editing
  document
    .querySelector("#uploadForm")
    .setAttribute("data-edit-id", resourceId);
  document.querySelector("#uploadModalLabel").textContent = "Edit Resource";

  // Show file preview
  document.getElementById("filePreview").style.display = "flex";
  document.getElementById("selectedFileName").textContent =
    resource.title + "." + resource.type;
  document.getElementById("fileDropArea").style.display = "none";

  // Set category if it exists
  if (resource.category) {
    const categorySelect = document.getElementById("resourceCategory");
    for (let i = 0; i < categorySelect.options.length; i++) {
      if (categorySelect.options[i].value === resource.category) {
        categorySelect.selectedIndex = i;
        break;
      }
    }
  }

  // Show cover image if it exists
  if (resource.coverImage) {
    document.getElementById("coverImagePreview").src = resource.coverImage;
    document.getElementById("coverImagePreview").style.display = "block";
  }
}

// Confirm delete resource
function confirmDeleteResource(resourceId) {
  if (
    confirm(
      "Are you sure you want to delete this resource? This action cannot be undone."
    )
  ) {
    deleteResource(resourceId);
  }
}

// Delete resource
function deleteResource(resourceId) {
  // Find the resource index
  const index = sampleResources.findIndex((r) => r.id === resourceId);
  if (index === -1) return;

  // Only allow deleting own resources
  if (sampleResources[index].userId !== currentUser.id) {
    showToast("You can only delete your own resources", "error");
    return;
  }

  // Remove from array
  sampleResources.splice(index, 1);

  // Save to localStorage after deletion
  localStorage.setItem("resources_data", JSON.stringify(sampleResources));

  // Also check if it exists in files table
  const fileIndex = sampleFiles.findIndex((f) => f.id === resourceId);
  if (fileIndex !== -1) {
    sampleFiles.splice(fileIndex, 1);
    // Also save the updated files array to localStorage
    localStorage.setItem("files_data", JSON.stringify(sampleFiles));
  }

  // Update UI
  applyFiltersAndSort();
  renderFilesTable();

  showToast("Resource deleted successfully", "success");
}

// Confirm delete file
function confirmDeleteFile(fileId) {
  if (
    confirm(
      "Are you sure you want to delete this file? This action cannot be undone."
    )
  ) {
    deleteFile(fileId);
  }
}

// Delete file function
function deleteFile(fileId) {
  // Find the file index
  const index = sampleFiles.findIndex((f) => f.id === fileId);
  if (index === -1) return;

  // Only allow deleting own files
  if (sampleFiles[index].userId !== currentUser.id) {
    showToast("You can only delete your own files", "error");
    return;
  }

  // Remove from array
  sampleFiles.splice(index, 1);

  // Save changes to localStorage
  localStorage.setItem("files_data", JSON.stringify(sampleFiles));

  // Update UI
  renderFilesTable();

  showToast("File deleted successfully", "success");
}

// Modal functions
function openUploadModal() {
  // Reset form first
  document.getElementById("uploadForm").reset();
  document.getElementById("uploadForm").removeAttribute("data-edit-id");
  document.getElementById("uploadModalLabel").textContent = "Upload Resource";
  document.getElementById("filePreview").style.display = "none";
  document.getElementById("fileDropArea").style.display = "block";
  document.getElementById("coverImagePreview").src = "";
  document.getElementById("coverImagePreview").style.display = "none";

  // Reset tags
  document.querySelectorAll(".tag-option").forEach((tag) => {
    tag.classList.remove("selected");
  });
  document.getElementById("selectedTags").value = "";

  // Show modal
  const modal = new bootstrap.Modal(document.getElementById("uploadModal"));
  modal.show();
}

function closeUploadModal() {
  const modal = bootstrap.Modal.getInstance(
    document.getElementById("uploadModal")
  );
  if (modal) modal.hide();
}

// File selection handling
document.getElementById("fileInput").addEventListener("change", function (e) {
  const file = e.target.files[0];
  if (file) {
    document.getElementById("filePreview").style.display = "flex";
    document.getElementById("selectedFileName").textContent = file.name;
    document.getElementById("fileDropArea").style.display = "none";

    // Auto-fill the title with the filename (without extension)
    const fileName = file.name.replace(/\.[^/.]+$/, "");
    document.getElementById("resourceTitle").value = fileName;

    // Auto-select type based on file extension
    const extension = file.name.split(".").pop().toLowerCase();
    const categorySelect = document.getElementById("resourceCategory");

    if (extension === "pdf") {
      for (let i = 0; i < categorySelect.options.length; i++) {
        if (categorySelect.options[i].value === "reference") {
          categorySelect.selectedIndex = i;
          break;
        }
      }
    } else if (extension === "ppt" || extension === "pptx") {
      for (let i = 0; i < categorySelect.options.length; i++) {
        if (categorySelect.options[i].value === "lecture") {
          categorySelect.selectedIndex = i;
          break;
        }
      }
    }
  }
});

// Cover image preview
document
  .getElementById("coverImageInput")
  .addEventListener("change", function (e) {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = function (e) {
        const preview = document.getElementById("coverImagePreview");
        preview.src = e.target.result;
        preview.style.display = "block";
      };
      reader.readAsDataURL(file);
    } else {
      document.getElementById("coverImagePreview").style.display = "none";
    }
  });

// Remove selected file
function removeSelectedFile() {
  document.getElementById("fileInput").value = "";
  document.getElementById("filePreview").style.display = "none";
  document.getElementById("fileDropArea").style.display = "block";
}

// Handle tag selection
document.querySelectorAll(".tag-option").forEach((tagOption) => {
  tagOption.addEventListener("click", function () {
    const selectedTags = document.querySelectorAll(".tag-option.selected");

    if (this.classList.contains("selected")) {
      // Deselect tag
      this.classList.remove("selected");
    } else if (selectedTags.length < 3) {
      // Select tag if less than 3 are selected
      this.classList.add("selected");
    } else {
      showToast("You can select up to 3 tags", "error");
    }

    // Update hidden field with selected tags
    const tags = [];
    document.querySelectorAll(".tag-option.selected").forEach((selected) => {
      tags.push(selected.getAttribute("data-tag"));
    });
    document.getElementById("selectedTags").value = tags.join(",");
  });
});

// Handle form submission
document.getElementById("uploadForm").addEventListener("submit", function (e) {
  e.preventDefault();

  const editId = this.getAttribute("data-edit-id");
  const isEditing = !!editId;

  // Get form values
  const title = document.getElementById("resourceTitle").value.trim();
  const description = document.getElementById("resourceDesc").value.trim();
  const category = document.getElementById("resourceCategory").value;
  const tagsValue = document.getElementById("selectedTags").value;
  const tags = tagsValue
    ? tagsValue.split(",").map((t) => {
        // Capitalize first letter
        return t.trim().charAt(0).toUpperCase() + t.trim().slice(1);
      })
    : [];

  let fileType;
  let fileName;
  let fileSize;

  // Process cover image
  const coverImageInput = document.getElementById("coverImageInput");
  let coverImageUrl = "";

  if (coverImageInput.files && coverImageInput.files[0]) {
    const coverImageFile = coverImageInput.files[0];
    // Create a data URL from the file (base64 encoded)
    coverImageUrl = document.getElementById("coverImagePreview").src;
  } else if (isEditing) {
    // Keep existing cover image if editing
    const resource = sampleResources.find((r) => r.id === editId);
    if (resource) {
      coverImageUrl = resource.coverImage || "";
    }
  }

  if (isEditing) {
    // We're editing an existing resource
    const resource = sampleResources.find((r) => r.id === editId);
    fileType = resource.type;
    fileName = resource.title + "." + resource.type;
    fileSize = resource.size;
  } else {
    // New upload - validate file
    const fileInput = document.getElementById("fileInput");

    if (!fileInput.files || fileInput.files.length === 0) {
      showToast("Please select a file to upload", "error");
      return;
    }

    const file = fileInput.files[0];
    fileName = file.name;

    // Check file type
    const extension = fileName.split(".").pop().toLowerCase();
    if (!["pdf", "doc", "docx", "ppt", "pptx"].includes(extension)) {
      showToast("Only PDF, DOCX, or PPT files are allowed", "error");
      return;
    }

    fileType =
      extension === "pdf"
        ? "pdf"
        : extension === "doc" || extension === "docx"
        ? "docx"
        : "ppt";

    // Format size
    fileSize = (file.size / 1024 / 1024).toFixed(1) + " MB";
  }

  // Add the file to both resources and files table
  if (isEditing) {
    // Update existing resource
    const resourceIndex = sampleResources.findIndex((r) => r.id === editId);
    if (resourceIndex !== -1) {
      sampleResources[resourceIndex] = {
        ...sampleResources[resourceIndex],
        title: title,
        desc: description,
        tags: tags,
        category: category,
        updated: new Date().toISOString(),
        coverImage: coverImageUrl,
      };

      // Also update the file table entry if it exists
      const fileIndex = sampleFiles.findIndex((f) => f.id === editId);
      if (fileIndex !== -1) {
        sampleFiles[fileIndex] = {
          ...sampleFiles[fileIndex],
          name: title + "." + fileType,
        };
      }
      localStorage.setItem("resources_data", JSON.stringify(sampleResources));
      localStorage.setItem("files_data", JSON.stringify(sampleFiles));
    }

    showToast("Resource updated successfully", "success");
  } else {
    // Add new resource
    const resourceId = "res-" + Date.now();
    const now = new Date().toISOString();

    sampleResources.unshift({
      id: resourceId,
      title: title,
      coverImage: coverImageUrl,
      desc: description || "",
      tags: tags,
      category: category,
      by: currentUser.name,
      userId: currentUser.id,
      date: now,
      type: fileType,
      size: fileSize,
      url: "#",
      downloads: 0,
      views: 0,
    });

    sampleFiles.unshift({
      id: resourceId,
      name: title + "." + fileType,
      by: currentUser.name,
      userId: currentUser.id,
      date: now,
      uploadDate: now,
      type: fileType.toUpperCase(),
      size: fileSize,
      url: "#",
      downloads: 0,
    });
    localStorage.setItem("resources_data", JSON.stringify(sampleResources));
    localStorage.setItem("files_data", JSON.stringify(sampleFiles));
    showToast("Resource uploaded successfully", "success");
  }

  closeUploadModal();
  applyFiltersAndSort();
  renderFilesTable();
});

// File drag and drop functionality
const dropArea = document.getElementById("fileDropArea");

["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, preventDefaults, false);
});

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

["dragenter", "dragover"].forEach((eventName) => {
  dropArea.addEventListener(eventName, highlight, false);
});

["dragleave", "drop"].forEach((eventName) => {
  dropArea.addEventListener(eventName, unhighlight, false);
});

function highlight() {
  dropArea.classList.add("highlight");
}

function unhighlight() {
  dropArea.classList.remove("highlight");
}

dropArea.addEventListener("drop", handleDrop, false);

function handleDrop(e) {
  const dt = e.dataTransfer;
  const files = dt.files;

  if (files.length) {
    document.getElementById("fileInput").files = files;
    // Trigger the change event manually
    const event = new Event("change");
    document.getElementById("fileInput").dispatchEvent(event);
  }
}

// Show toast notification
function showToast(message, type = "success") {
  const toastContainer = document.getElementById("toastContainer");
  const id = "toast-" + Date.now();

  const toast = document.createElement("div");
  toast.className = `toast ${type}`;
  toast.id = id;

  toast.innerHTML = `
      <div class="toast-icon ${type}">
        <i class="bi bi-${
          type === "success" ? "check-circle" : "exclamation-circle"
        }"></i>
      </div>
      <div class="toast-content">
        <div class="toast-title">${
          type === "success" ? "Success" : "Error"
        }</div>
        <div class="toast-message">${message}</div>
      </div>
      <button class="toast-close" onclick="closeToast('${id}')">
        <i class="bi bi-x"></i>
      </button>
    `;

  toastContainer.appendChild(toast);

  // Auto remove after 5 seconds
  setTimeout(() => {
    closeToast(id);
  }, 5000);
}

// Close toast notification
window.closeToast = function (id) {
  const toast = document.getElementById(id);
  if (toast) {
    toast.style.opacity = "0";
    toast.style.transform = "translateX(100%)";
    setTimeout(() => {
      toast.remove();
    }, 300);
  }
};

// Initialize lazy loading for images
function initLazyLoading() {
  const lazyImages = document.querySelectorAll(".lazy-image");

  lazyImages.forEach((img) => {
    img.onload = function () {
      this.classList.add("loaded");
    };
  });
}

// Sidebar toggle
const menuToggle = document.getElementById("menuToggle");
const sidebar = document.getElementById("sidebar");
const mainContent = document.getElementById("mainContent");

menuToggle.addEventListener("click", function () {
  sidebar.classList.toggle("open");
  mainContent.classList.toggle("shifted");

  // Save sidebar state to localStorage
  localStorage.setItem("sidebarOpen", sidebar.classList.contains("open"));
});

document.addEventListener("click", function (event) {
  if (window.innerWidth <= 768) {
    if (!sidebar.contains(event.target) && !menuToggle.contains(event.target)) {
      sidebar.classList.remove("open");
      mainContent.classList.remove("shifted");
    }
  }
});

function goToProfile() {
  showToast("Redirecting to profile page", "success");
  // In a real app, you would navigate to the profile page
  window.location.href = "profile.html";
}

// Search functionality - UPDATED for new search bar
const searchInput = document.getElementById("resourceSearch");

searchInput.addEventListener("input", function () {
  state.currentSearch = this.value.trim().toLowerCase();
  applyFiltersAndSort();
});

// Set up view toggling
document.getElementById("gridViewBtn").addEventListener("click", function () {
  setViewMode("grid");
});

document.getElementById("listViewBtn").addEventListener("click", function () {
  setViewMode("list");
});

// Set up sort dropdown handler
document.getElementById("sortDropdown").addEventListener("change", function () {
  state.currentSort = this.value;
  applyFiltersAndSort();
});

// Set up table sort handler
document.getElementById("tableSort").addEventListener("change", function () {
  state.tableSort = this.value;
  renderFilesTable(state.tableSort);
});

// Initialize page
document.addEventListener("DOMContentLoaded", function () {
  // Initialize theme
  initializeTheme();

  // Open sidebar by default - NEW FEATURE
  const sidebarOpen = localStorage.getItem("sidebarOpen");
  // If we're on a larger screen, open the sidebar by default
  if (window.innerWidth > 768 && sidebarOpen !== "false") {
    sidebar.classList.add("open");
    mainContent.classList.add("shifted");
    localStorage.setItem("sidebarOpen", "true");
  }

  loadUserData();
  applyFiltersAndSort();
  renderFilesTable();

  // Set current date in UI (example for demo)
  const currentDateElements = document.querySelectorAll(".current-date");
  const formattedDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  currentDateElements.forEach((el) => {
    el.textContent = formattedDate;
  });

  // Update search placeholder based on screen size
  function updateSearchPlaceholder() {
    const width = window.innerWidth;
    if (width <= 360) {
      searchInput.placeholder = "Search...";
    } else if (width <= 480) {
      searchInput.placeholder = "Search...";
    } else {
      searchInput.placeholder = "Search resources...";
    }
  }

  // Call it once and add resize listener
  updateSearchPlaceholder();
  window.addEventListener("resize", updateSearchPlaceholder);

  // Show welcome notification if this is first visit
  if (!localStorage.getItem("resource_page_visited")) {
    setTimeout(() => {
      showToast(
        "Welcome to the Resources page! You can upload and manage study materials here.",
        "success"
      );
      localStorage.setItem("resource_page_visited", "true");
    }, 1000);
  }

  console.log(
    `Resources page loaded for ${CURRENT_SESSION.user} at ${CURRENT_SESSION.utcTime} UTC`
  );
});
