(() => {
  const tree = window.PORTFOLIO_TREE || [];
  const pages = window.PORTFOLIO_PAGES || {};
  const treeMount = document.querySelector("[data-work-tree]");
  const stageTarget = document.querySelector("[data-work-stage]") || document.querySelector(".work-stage");
  const basePath = document.body.dataset.basePath || "./";
  const baseUrl = new URL(`${basePath}index.html`, window.location.href);
  const works = new Map();
  const allWorks = [];
  const openGroupsStorageKey = "meinong-portfolio-open-groups";
  const sortModeStorageKey = "meinong-portfolio-sort-mode";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stageTransitionTimer = null;
  let activeLightboxCleanup = null;
  const preloadedImages = new Set();
  const loadedImageDetails = new Map();

  const loadOpenGroups = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(openGroupsStorageKey) || "[]"));
    } catch {
      return new Set();
    }
  };

  const openGroups = loadOpenGroups();

  const loadSortMode = () => {
    try {
      const value = localStorage.getItem(sortModeStorageKey);
      return value === "chronological" ? "chronological" : "categories";
    } catch {
      return "categories";
    }
  };

  let sortMode = loadSortMode();

  const saveOpenGroups = () => {
    try {
      localStorage.setItem(openGroupsStorageKey, JSON.stringify([...openGroups]));
    } catch {
      // Keep navigation usable if localStorage is unavailable.
    }
  };

  const saveSortMode = () => {
    try {
      localStorage.setItem(sortModeStorageKey, sortMode);
    } catch {
      // Keep the control usable if localStorage is unavailable.
    }
  };

  const walk = (nodes) => {
    nodes.forEach((node) => {
      if (node.slug) {
        works.set(node.slug, node);
        allWorks.push(node);
      }

      if (node.children) {
        walk(node.children);
      }
    });
  };

  const getHref = (slug) => `${basePath}works/${slug}/index.html`;

  const appendWorkLabel = (parent, work) => {
    const title = document.createElement("span");
    title.className = "work-link-title";
    title.textContent = work.title;
    parent.append(title);

    if (!work.year) {
      return;
    }

    const year = document.createElement("span");
    year.className = "work-year";
    year.textContent = `(${work.year})`;
    parent.append(year);
  };

  const buildWorkNode = (work) => {
    const item = document.createElement("li");
    const link = document.createElement("a");

    item.className = "tree-entry tree-work";
    link.className = "work-link";
    link.href = getHref(work.slug);
    link.dataset.workSlug = work.slug;
    link.dataset.workTitle = work.title;
    appendWorkLabel(link, work);

    item.append(link);
    return item;
  };

  const getSortYear = (work) => {
    const match = String(work.year || "").match(/\d{4}/);
    return match ? Number(match[0]) : -Infinity;
  };

  const updateActiveWorkLink = (slug) => {
    document.querySelectorAll("[data-work-slug]").forEach((link) => {
      const isActive = link.dataset.workSlug === slug;
      link.classList.toggle("is-active", isActive);

      if (isActive) {
        link.setAttribute("aria-current", "page");
      } else {
        link.removeAttribute("aria-current");
      }
    });
  };

  const collapseDescendantGroups = (container) => {
    container.querySelectorAll(".category-toggle").forEach((toggle) => {
      const panel = document.getElementById(toggle.getAttribute("aria-controls"));

      toggle.setAttribute("aria-expanded", "false");

      if (toggle.dataset.groupId) {
        openGroups.delete(toggle.dataset.groupId);
      }

      if (panel) {
        panel.hidden = true;
      }
    });
  };

  const collapseAllGroups = () => {
    openGroups.clear();

    if (treeMount) {
      treeMount.querySelectorAll(".category-toggle").forEach((toggle) => {
        toggle.setAttribute("aria-expanded", "false");
      });

      treeMount.querySelectorAll(".tree-children").forEach((panel) => {
        panel.hidden = true;
      });
    }

    saveOpenGroups();
  };

  const buildGroupNode = (group, parentId = "") => {
    const item = document.createElement("li");
    const button = document.createElement("button");
    const children = document.createElement("ul");
    const groupId = parentId ? `${parentId}-${group.id}` : group.id;
    const panelId = `cat-${groupId}`;
    const isSubcategory = Boolean(parentId);
    const isOpen = openGroups.has(groupId);

    item.className = `tree-entry tree-group ${isSubcategory ? "tree-subgroup" : "tree-main-group"}`;
    button.className = `category-toggle ${isSubcategory ? "subcategory-toggle" : "main-category-toggle"}`;
    button.type = "button";
    button.setAttribute("aria-controls", panelId);
    button.setAttribute("aria-expanded", String(isOpen));
    button.dataset.groupId = groupId;

    if (isSubcategory) {
      const title = document.createElement("span");
      title.className = "subcategory-title";
      title.textContent = group.title;
      button.append(title);
    } else {
      button.append(document.createTextNode(group.title));

      if (group.note) {
        const note = document.createElement("span");
        note.className = "category-note";
        note.textContent = ` (${group.note})`;
        button.append(note);
      }
    }

    children.className = `tree-children ${isSubcategory ? "subcategory-children" : "category-children"}`;
    children.id = panelId;
    children.hidden = !isOpen;

    if (!group.children || group.children.length === 0) {
      children.classList.add("is-empty");
    } else {
      group.children.forEach((child) => {
        children.append(child.slug ? buildWorkNode(child) : buildGroupNode(child, groupId));
      });
    }

    button.addEventListener("click", () => {
      const isOpen = button.getAttribute("aria-expanded") === "true";
      const nextIsOpen = !isOpen;

      button.setAttribute("aria-expanded", String(nextIsOpen));
      children.hidden = !nextIsOpen;

      if (nextIsOpen) {
        openGroups.add(groupId);
      } else {
        openGroups.delete(groupId);
        collapseDescendantGroups(children);
      }

      saveOpenGroups();
    });

    item.append(button, children);
    return item;
  };

  const buildSortControl = () => {
    const control = document.createElement("div");
    const label = document.createElement("span");
    const menuWrap = document.createElement("span");
    const button = document.createElement("button");
    const menu = document.createElement("ul");
    const options = [
      ["categories", "categories"],
      ["chronological", "chronological"]
    ];

    control.className = "sort-control";
    label.className = "sort-label";
    label.textContent = "sort by:";
    menuWrap.className = "sort-menu-wrap";

    button.className = "sort-button";
    button.type = "button";
    button.textContent = sortMode;
    button.setAttribute("aria-label", "sort works by");
    button.setAttribute("aria-haspopup", "listbox");
    button.setAttribute("aria-expanded", "false");

    menu.className = "sort-menu";
    menu.role = "listbox";
    menu.hidden = true;

    options.forEach(([value, text]) => {
      const item = document.createElement("li");
      const option = document.createElement("button");

      option.className = "sort-option";
      option.type = "button";
      option.textContent = text;
      option.role = "option";
      option.dataset.sortMode = value;
      option.setAttribute("aria-selected", String(sortMode === value));

      option.addEventListener("click", () => {
        sortMode = value === "chronological" ? "chronological" : "categories";
        saveSortMode();
        renderTree();
        updateActiveWorkLink(document.body.dataset.currentSlug || "");
      });

      item.append(option);
      menu.append(item);
    });

    const closeMenu = () => {
      menu.hidden = true;
      button.setAttribute("aria-expanded", "false");
    };

    const openMenu = () => {
      menu.hidden = false;
      button.setAttribute("aria-expanded", "true");
      document.addEventListener("click", closeMenu, { once: true });
    };

    button.addEventListener("click", (event) => {
      event.stopPropagation();

      if (menu.hidden) {
        openMenu();
      } else {
        closeMenu();
      }
    });

    menuWrap.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    menuWrap.append(button, menu);
    control.append(label, menuWrap);
    return control;
  };

  const buildChronologicalList = () => {
    const root = document.createElement("ul");
    root.className = "tree-root chronological-root";

    allWorks
      .map((work, index) => ({ work, index, year: getSortYear(work) }))
      .sort((a, b) => b.year - a.year || a.index - b.index)
      .forEach(({ work }) => {
        root.append(buildWorkNode(work));
      });

    return root;
  };

  const buildCuratedList = () => {
    const root = document.createElement("ul");
    root.className = "tree-root curated-root";

    tree.forEach((group) => {
      root.append(buildGroupNode(group));
    });

    return root;
  };

  const renderTree = () => {
    if (!treeMount) {
      return;
    }

    treeMount.replaceChildren(
      buildSortControl(),
      sortMode === "chronological" ? buildChronologicalList() : buildCuratedList()
    );
  };

  const tensorImageCdn = (src, size = 400) =>
    `https://prod-image-cdn.tensor.trade/images/${size}x${size}/freeze=true/${encodeURIComponent(src)}`;

  const isAbsoluteUrl = (src) => /^[a-z][a-z\d+.-]*:|^\/\//i.test(src);

  const getAssetUrl = (src) => {
    if (!src || isAbsoluteUrl(src) || src.startsWith("/")) {
      return src;
    }

    return `${basePath}${src.replace(/^\.\//, "")}`;
  };

  const getThumbnailUrl = (item, gallery) =>
    getAssetUrl(item.thumbSrc) || tensorImageCdn(item.src, gallery.thumbSize || 400);

  const getFullImageUrl = (item) => getAssetUrl(item.fullSrc || item.src);

  const getGalleryOrderValue = (item, index) => {
    if (Number.isFinite(item.order)) {
      return item.order;
    }

    if (Number.isFinite(item.number)) {
      return item.number;
    }

    const match = String(item.title || item.src || item.thumbSrc || "").match(/\d+/);
    return match ? Number(match[0]) : index;
  };

  const shuffleGalleryItems = (items) => {
    const shuffled = [...items];

    for (let index = shuffled.length - 1; index > 0; index -= 1) {
      const targetIndex = Math.floor(Math.random() * (index + 1));
      [shuffled[index], shuffled[targetIndex]] = [shuffled[targetIndex], shuffled[index]];
    }

    return shuffled;
  };

  const preloadImage = (src) => {
    if (!src || preloadedImages.has(src)) {
      return;
    }

    preloadedImages.add(src);

    const image = new Image();
    image.decoding = "async";
    image.src = src;
  };

  const loadImageDetails = (src) => {
    if (!src) {
      return Promise.resolve({ width: 1, height: 1 });
    }

    if (loadedImageDetails.has(src)) {
      return loadedImageDetails.get(src);
    }

    const promise = new Promise((resolve) => {
      const image = new Image();

      image.decoding = "async";
      image.onload = () => {
        resolve({
          width: image.naturalWidth || 1,
          height: image.naturalHeight || 1
        });
      };
      image.onerror = () => {
        resolve({ width: 1, height: 1 });
      };
      image.src = src;
    });

    loadedImageDetails.set(src, promise);
    return promise;
  };

  const schedulePreload = (callback, delay = 0) => {
    if ("requestIdleCallback" in window) {
      window.setTimeout(() => {
        window.requestIdleCallback(callback, { timeout: 1800 });
      }, delay);
      return;
    }

    window.setTimeout(callback, delay);
  };

  const closeLightbox = () => {
    if (!activeLightboxCleanup) {
      return;
    }

    activeLightboxCleanup();
    activeLightboxCleanup = null;
  };

  const openLightbox = (item, title, items = [item], startIndex = 0, options = {}) => {
    const shell = document.querySelector(".site-shell");
    const overlay = document.createElement("div");
    const closeButton = document.createElement("button");
    const itemLink = document.createElement("a");
    const itemLinkIcon = document.createElement("img");
    const previousButton = document.createElement("button");
    const nextButton = document.createElement("button");
    const mediaWrap = document.createElement("figure");
    const image = document.createElement("img");
    const caption = document.createElement("figcaption");
    let currentIndex = Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0));
    let currentImageDetails = null;
    let lightboxRequestId = 0;

    closeLightbox();

    overlay.className = "lightbox-overlay";
    overlay.setAttribute("role", "dialog");
    overlay.setAttribute("aria-modal", "true");
    overlay.setAttribute("aria-label", item.title || title);

    closeButton.className = "lightbox-close";
    closeButton.type = "button";
    closeButton.setAttribute("aria-label", "close expanded image");

    itemLink.className = "lightbox-item-link";
    itemLink.target = "_blank";
    itemLink.rel = "noreferrer";
    itemLinkIcon.alt = "";
    itemLinkIcon.decoding = "async";

    previousButton.className = "lightbox-nav lightbox-nav-previous";
    previousButton.type = "button";
    previousButton.textContent = "←";
    previousButton.setAttribute("aria-label", "previous image");

    nextButton.className = "lightbox-nav lightbox-nav-next";
    nextButton.type = "button";
    nextButton.textContent = "→";
    nextButton.setAttribute("aria-label", "next image");

    mediaWrap.className = "lightbox-media";
    caption.className = "lightbox-caption";

    mediaWrap.append(image, caption);
    overlay.append(closeButton, itemLink, previousButton, nextButton, mediaWrap);
    document.body.append(overlay);
    document.body.classList.add("has-lightbox");

    if (shell) {
      shell.classList.add("is-lightbox-blurred");
    }

    const getLightboxImageBounds = (details) => {
      const naturalWidth = Math.max(1, details.width || 1);
      const naturalHeight = Math.max(1, details.height || 1);
      const maxWidth = Math.min(window.innerWidth * 0.92, 1400);
      const maxHeight = Math.max(120, window.innerHeight * 0.88 - 32);
      const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);
      const width = Math.max(1, Math.round(naturalWidth * scale));
      const height = Math.max(1, Math.round(naturalHeight * scale));
      const left = (window.innerWidth - width) / 2;

      return {
        left,
        right: left + width,
        width,
        height
      };
    };

    const positionLightboxNavigation = (targetBounds) => {
      const imageBounds = targetBounds || (currentImageDetails ? getLightboxImageBounds(currentImageDetails) : image.getBoundingClientRect());

      if (!imageBounds.width || !imageBounds.height) {
        return;
      }

      const previousWidth = previousButton.offsetWidth || 28;
      const nextWidth = nextButton.offsetWidth || 28;
      const previousLeft = Math.max(12, imageBounds.left / 2 - previousWidth / 2);
      const nextLeft = Math.min(
        window.innerWidth - nextWidth - 12,
        imageBounds.right + (window.innerWidth - imageBounds.right) / 2 - nextWidth / 2
      );

      previousButton.style.left = `${previousLeft}px`;
      nextButton.style.left = `${nextLeft}px`;
    };

    const applyLightboxImageSize = (details) => {
      const bounds = getLightboxImageBounds(details);

      image.style.width = `${bounds.width}px`;
      image.style.height = `${bounds.height}px`;
      positionLightboxNavigation(bounds);
    };

    const updateLightboxExternalLink = (currentItem, label) => {
      const externalUrl = currentItem.externalUrl || currentItem.url;
      const externalIcon = currentItem.externalIcon || options.externalIcon;

      if (externalUrl) {
        itemLink.href = externalUrl;
        itemLink.hidden = false;
        itemLink.setAttribute("aria-label", `open ${label} on ${options.externalLabel || "external site"}`);

        if (externalIcon) {
          itemLink.classList.add("has-external-icon");
          itemLinkIcon.src = getAssetUrl(externalIcon);
          itemLink.replaceChildren(itemLinkIcon);
        } else {
          itemLink.classList.remove("has-external-icon");
          itemLink.textContent = "↑";
        }
      } else {
        itemLink.hidden = true;
        itemLink.removeAttribute("href");
      }
    };

    const updateLightboxImage = () => {
      const requestId = ++lightboxRequestId;
      const currentItem = items[currentIndex] || item;
      const label = currentItem.title || title;
      const src = getFullImageUrl(currentItem);

      image.hidden = true;
      image.removeAttribute("src");
      image.alt = label;
      image.style.removeProperty("width");
      image.style.removeProperty("height");
      caption.textContent = label;
      overlay.setAttribute("aria-label", label);
      overlay.classList.add("is-measuring");
      mediaWrap.classList.add("is-loading");
      mediaWrap.setAttribute("aria-busy", "true");
      currentImageDetails = null;
      updateLightboxExternalLink(currentItem, label);

      previousButton.disabled = currentIndex <= 0;
      nextButton.disabled = currentIndex >= items.length - 1;

      if (items[currentIndex - 1]) {
        loadImageDetails(getFullImageUrl(items[currentIndex - 1]));
      }

      if (items[currentIndex + 1]) {
        loadImageDetails(getFullImageUrl(items[currentIndex + 1]));
      }

      loadImageDetails(src).then((details) => {
        if (requestId !== lightboxRequestId || !document.body.contains(overlay)) {
          return;
        }

        currentImageDetails = details;
        applyLightboxImageSize(details);
        image.src = src;
        image.hidden = false;
        overlay.classList.remove("is-measuring");
        mediaWrap.classList.remove("is-loading");
        mediaWrap.removeAttribute("aria-busy");
      });
    };

    const showAdjacentImage = (offset) => {
      const nextIndex = Math.min(Math.max(currentIndex + offset, 0), items.length - 1);

      if (nextIndex === currentIndex) {
        return;
      }

      currentIndex = nextIndex;
      updateLightboxImage();
    };

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        closeLightbox();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        showAdjacentImage(-1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        showAdjacentImage(1);
      }
    };

    activeLightboxCleanup = () => {
      document.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("resize", resizeLightboxImage);
      document.body.classList.remove("has-lightbox");

      if (shell) {
        shell.classList.remove("is-lightbox-blurred");
      }

      overlay.remove();
    };

    overlay.addEventListener("click", (event) => {
      if (!event.target.closest(".lightbox-media, .lightbox-nav, .lightbox-close, .lightbox-item-link")) {
        closeLightbox();
      }
    });

    closeButton.addEventListener("click", closeLightbox);
    itemLink.addEventListener("click", (event) => event.stopPropagation());
    const resizeLightboxImage = () => {
      if (currentImageDetails) {
        applyLightboxImageSize(currentImageDetails);
        return;
      }

      positionLightboxNavigation();
    };

    image.addEventListener("load", resizeLightboxImage);
    previousButton.addEventListener("click", (event) => {
      event.stopPropagation();
      showAdjacentImage(-1);
    });
    nextButton.addEventListener("click", (event) => {
      event.stopPropagation();
      showAdjacentImage(1);
    });
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", resizeLightboxImage);
    updateLightboxImage();
  };

  const buildGalleryPage = (work, page) => {
    const gallery = page.gallery || {};
    const sourceItems = gallery.items || [];
    const zoomLevels = (gallery.zoomLevels || [
      { columns: 1, rows: 1 },
      { columns: 3, rows: 2 },
      { columns: gallery.columns || 4, rows: gallery.rows || 3 },
      { columns: 5, rows: 4 },
      { columns: 8, rows: 6 }
    ]).map((level) => ({
      columns: Math.max(1, Number(level.columns) || 1),
      rows: Math.max(1, Number(level.rows) || 1)
    }));
    const defaultZoomIndex = Math.min(
      zoomLevels.length - 1,
      Math.max(0, Number.isFinite(gallery.defaultZoomIndex) ? gallery.defaultZoomIndex : 2)
    );
    const article = document.createElement("article");
    const grid = document.createElement("div");
    const controls = document.createElement("div");
    const sortControl = document.createElement("div");
    const sortLabel = document.createElement("span");
    const sortMenuWrap = document.createElement("span");
    const sortButton = document.createElement("button");
    const sortMenu = document.createElement("ul");
    const pagination = document.createElement("div");
    const previous = document.createElement("button");
    const pageStatus = document.createElement("span");
    const next = document.createElement("button");
    const zoomControls = document.createElement("div");
    const zoomIcon = document.createElement("span");
    const zoomIn = document.createElement("button");
    const zoomOut = document.createElement("button");
    const footer = document.createElement("footer");
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    const description = document.createElement("p");
    let gallerySortMode = "random";
    let galleryItems = [];
    let zoomIndex = defaultZoomIndex;
    let pageIndex = 0;
    let pageSize = 1;
    let pageCount = 1;

    article.className = "work-page gallery-page";
    grid.className = "gallery-grid";

    controls.className = "gallery-controls";

    sortControl.className = "sort-control gallery-sort-control";
    sortLabel.className = "sort-label";
    sortLabel.textContent = "sort by:";
    sortMenuWrap.className = "sort-menu-wrap";
    sortButton.className = "sort-button gallery-sort-button";
    sortButton.type = "button";
    sortButton.setAttribute("aria-label", "sort gallery by");
    sortButton.setAttribute("aria-haspopup", "listbox");
    sortButton.setAttribute("aria-expanded", "false");

    sortMenu.className = "sort-menu gallery-sort-menu";
    sortMenu.role = "listbox";
    sortMenu.hidden = true;

    pagination.className = "gallery-pagination";
    previous.className = "gallery-page-button";
    previous.type = "button";
    previous.textContent = "←";
    previous.setAttribute("aria-label", "previous gallery page");

    pageStatus.className = "gallery-page-status";

    next.className = "gallery-page-button";
    next.type = "button";
    next.textContent = "→";
    next.setAttribute("aria-label", "next gallery page");

    zoomControls.className = "gallery-zoom-controls";
    zoomIcon.className = "gallery-zoom-icon";
    zoomIcon.setAttribute("aria-hidden", "true");

    zoomIn.className = "gallery-zoom-button";
    zoomIn.type = "button";
    zoomIn.textContent = "+";
    zoomIn.setAttribute("aria-label", "zoom gallery in");

    zoomOut.className = "gallery-zoom-button";
    zoomOut.type = "button";
    zoomOut.textContent = "-";
    zoomOut.setAttribute("aria-label", "zoom gallery out");

    footer.className = "gallery-footer";
    copy.className = "gallery-copy";
    title.className = "gallery-title";
    title.textContent = page.title || work.title;

    description.className = "gallery-description";
    description.textContent = page.description || "";

    copy.append(title);

    if (page.description) {
      copy.append(description);
    }

    footer.append(copy);

    if (page.externalUrl) {
      const external = document.createElement("a");
      external.className = "gallery-external-link";
      external.href = page.externalUrl;
      external.target = "_blank";
      external.rel = "noreferrer";
      external.setAttribute("aria-label", `open ${work.title} externally`);

      if (page.externalIcon) {
        const icon = document.createElement("img");

        external.classList.add("has-external-icon");
        icon.src = getAssetUrl(page.externalIcon);
        icon.alt = "";
        icon.decoding = "async";
        external.append(icon);
      } else {
        external.textContent = "↑";
      }

      footer.append(external);
    }

    const getSortedGalleryItems = () => {
      if (gallerySortMode === "ordered") {
        return sourceItems
          .map((item, index) => ({ item, index, order: getGalleryOrderValue(item, index) }))
          .sort((a, b) => a.order - b.order || a.index - b.index)
          .map(({ item }) => item);
      }

      return shuffleGalleryItems(sourceItems);
    };

    const updateSortControl = () => {
      sortButton.textContent = gallerySortMode;
      sortMenu.querySelectorAll("[data-gallery-sort-mode]").forEach((option) => {
        option.setAttribute("aria-selected", String(option.dataset.gallerySortMode === gallerySortMode));
      });
    };

    const closeSortMenu = () => {
      sortMenu.hidden = true;
      sortButton.setAttribute("aria-expanded", "false");
    };

    const openSortMenu = () => {
      sortMenu.hidden = false;
      sortButton.setAttribute("aria-expanded", "true");
      document.addEventListener("click", closeSortMenu, { once: true });
    };

    const setGallerySortMode = (mode) => {
      gallerySortMode = mode === "ordered" ? "ordered" : "random";
      galleryItems = getSortedGalleryItems();
      pageIndex = 0;
      updateSortControl();
      closeSortMenu();
      renderPage();
    };

    [
      ["random", "random"],
      ["ordered", "ordered"]
    ].forEach(([value, text]) => {
      const item = document.createElement("li");
      const option = document.createElement("button");

      option.className = "sort-option";
      option.type = "button";
      option.textContent = text;
      option.role = "option";
      option.dataset.gallerySortMode = value;
      option.setAttribute("aria-selected", String(gallerySortMode === value));

      option.addEventListener("click", () => setGallerySortMode(value));

      item.append(option);
      sortMenu.append(item);
    });

    sortButton.addEventListener("click", (event) => {
      event.stopPropagation();

      if (sortMenu.hidden) {
        openSortMenu();
      } else {
        closeSortMenu();
      }
    });

    sortMenuWrap.addEventListener("click", (event) => {
      event.stopPropagation();
    });

    sortMenuWrap.append(sortButton, sortMenu);
    sortControl.append(sortLabel, sortMenuWrap);

    const updateZoomControls = () => {
      const level = zoomLevels[zoomIndex];

      grid.style.setProperty("--gallery-columns", level.columns);
      grid.style.setProperty("--gallery-rows", level.rows);
      article.dataset.galleryZoom = `${level.columns}x${level.rows}`;
      zoomIn.disabled = zoomIndex === 0;
      zoomOut.disabled = zoomIndex === zoomLevels.length - 1;
    };

    const setZoomIndex = (nextZoomIndex) => {
      zoomIndex = Math.min(zoomLevels.length - 1, Math.max(0, nextZoomIndex));
      pageIndex = 0;
      renderPage();
    };

    const preloadGalleryPage = (targetPageIndex, mode) => {
      if (targetPageIndex < 0 || targetPageIndex >= pageCount) {
        return;
      }

      const start = targetPageIndex * pageSize;
      const pageItems = galleryItems.slice(start, start + pageSize);

      pageItems.forEach((item, index) => {
        const delay = mode === "full" ? index * 110 : index * 25;

        schedulePreload(() => {
          if (mode === "full") {
            loadImageDetails(getFullImageUrl(item));
          } else {
            preloadImage(getThumbnailUrl(item, gallery));
          }
        }, delay);
      });
    };

    const preloadAroundCurrentPage = () => {
      preloadGalleryPage(pageIndex, "full");
      preloadGalleryPage(pageIndex - 1, "thumb");

      for (let nextPageIndex = pageIndex + 1; nextPageIndex <= Math.min(pageIndex + 2, pageCount - 1); nextPageIndex += 1) {
        preloadGalleryPage(nextPageIndex, "thumb");
      }
    };

    const renderPage = () => {
      const level = zoomLevels[zoomIndex];
      const columns = level.columns;
      const rows = level.rows;

      pageSize = columns * rows;
      pageCount = Math.max(1, Math.ceil(galleryItems.length / pageSize));
      pageIndex = Math.min(pageIndex, pageCount - 1);
      updateZoomControls();

      const start = pageIndex * pageSize;
      const visibleItems = galleryItems.slice(start, start + pageSize);
      const shouldUseFullImage = pageSize === 1;

      grid.replaceChildren();

      Array.from({ length: pageSize }).forEach((_, index) => {
        const item = visibleItems[index];

        if (!item) {
          const emptyCell = document.createElement("span");

          emptyCell.className = "gallery-item gallery-item-empty";
          emptyCell.setAttribute("aria-hidden", "true");
          grid.append(emptyCell);
          return;
        }

        const button = document.createElement("button");
        const image = document.createElement("img");
        const loadingIndicator = document.createElement("span");
        let isLoaded = false;

        button.className = "gallery-item";
        button.type = "button";
        button.setAttribute("aria-label", `expand ${item.title || work.title}`);

        image.alt = item.title || work.title;
        image.loading = "lazy";
        image.decoding = "async";

        loadingIndicator.className = "gallery-loading";
        loadingIndicator.setAttribute("aria-hidden", "true");

        const loadingTimer = window.setTimeout(() => {
          if (!isLoaded) {
            button.classList.add("is-loading");
          }
        }, 500);

        const markLoaded = () => {
          isLoaded = true;
          window.clearTimeout(loadingTimer);
          button.classList.remove("is-loading");
          button.classList.add("is-loaded");
        };

        image.addEventListener("load", markLoaded, { once: true });
        image.addEventListener("error", markLoaded, { once: true });
        image.src = shouldUseFullImage ? getFullImageUrl(item) : getThumbnailUrl(item, gallery);

        if (image.complete) {
          markLoaded();
        }

        let lastLightboxOpenAt = 0;
        const openGalleryLightbox = () => {
          const now = window.performance.now();

          if (now - lastLightboxOpenAt < 250) {
            return;
          }

          lastLightboxOpenAt = now;
          openLightbox(item, work.title, galleryItems, start + index, {
            externalIcon: page.externalIcon,
            externalLabel: "Tensor"
          });
        };

        button.append(image, loadingIndicator);
        button.addEventListener("pointerup", (event) => {
          if (event.button && event.button !== 0) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          openGalleryLightbox();
        });
        button.addEventListener("click", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openGalleryLightbox();
        });
        button.addEventListener("keydown", (event) => {
          if (!["Enter", " "].includes(event.key)) {
            return;
          }

          event.preventDefault();
          openGalleryLightbox();
        });
        grid.append(button);
      });

      pageStatus.textContent = `${pageIndex + 1} / ${pageCount}`;
      previous.disabled = pageIndex === 0;
      next.disabled = pageIndex >= pageCount - 1;
      preloadAroundCurrentPage();
    };

    previous.addEventListener("click", () => {
      pageIndex = Math.max(0, pageIndex - 1);
      renderPage();
    });

    next.addEventListener("click", () => {
      pageIndex = Math.min(pageCount - 1, pageIndex + 1);
      renderPage();
    });

    zoomIn.addEventListener("click", () => setZoomIndex(zoomIndex - 1));
    zoomOut.addEventListener("click", () => setZoomIndex(zoomIndex + 1));

    galleryItems = getSortedGalleryItems();
    updateSortControl();

    pagination.append(previous, pageStatus, next);
    zoomControls.append(zoomIcon, zoomOut, zoomIn);
    controls.append(sortControl, pagination, zoomControls);
    article.append(grid, controls, footer);
    renderPage();
    return article;
  };

  const buildPlaceholderPage = (work) => {
    const title = document.createElement("h2");

    title.className = "work-title";
    title.dataset.workTitle = "";
    title.textContent = work.title;
    return title;
  };

  const renderWorkContent = (work) => {
    if (!stageTarget) {
      return;
    }

    const page = pages[work.slug];
    const isGallery = page && page.type === "gallery";

    stageTarget.classList.toggle("has-gallery", isGallery);
    stageTarget.classList.toggle("has-placeholder", !isGallery);
    stageTarget.replaceChildren(isGallery ? buildGalleryPage(work, page) : buildPlaceholderPage(work));
  };

  const renderHomeContent = () => {
    if (!stageTarget) {
      return;
    }

    stageTarget.classList.remove("has-gallery", "has-placeholder");
    stageTarget.replaceChildren();
  };

  const transitionStage = (render, shouldTransition) => {
    if (!stageTarget || !shouldTransition || prefersReducedMotion.matches) {
      render();
      return;
    }

    window.clearTimeout(stageTransitionTimer);
    stageTarget.classList.add("is-transitioning");

    stageTransitionTimer = window.setTimeout(() => {
      render();
      requestAnimationFrame(() => {
        stageTarget.classList.remove("is-transitioning");
      });
    }, 90);
  };

  const pushUrl = (state, url, fallbackUrl) => {
    try {
      history.pushState(state, "", url);
    } catch {
      if (!fallbackUrl) {
        return;
      }

      try {
        history.pushState(state, "", fallbackUrl);
      } catch {
        // Keep the in-place transition even if the browser refuses URL mutation.
      }
    }
  };

  const getWorkHash = (slug) => `#works/${encodeURIComponent(slug)}`;

  const setCurrentWork = (work, url, shouldPush, shouldTransition = true) => {
    if (!stageTarget) {
      return;
    }

    closeLightbox();

    transitionStage(() => {
      renderWorkContent(work);
      document.title = `${work.title} | works by+with meinong`;
      document.body.dataset.currentSlug = work.slug;
      updateActiveWorkLink(work.slug);
    }, shouldTransition);

    if (shouldPush) {
      const nextUrl = window.location.protocol === "file:" ? getWorkHash(work.slug) : url;
      pushUrl({ slug: work.slug }, nextUrl, getWorkHash(work.slug));
    }
  };

  const clearCurrentWork = (shouldPush, shouldTransition = true) => {
    closeLightbox();

    transitionStage(() => {
      renderHomeContent();
      document.title = "works by+with meinong";
      delete document.body.dataset.currentSlug;
      updateActiveWorkLink("");
    }, shouldTransition);

    if (shouldPush) {
      const nextUrl = window.location.protocol === "file:" ? "#" : baseUrl.href;
      pushUrl({}, nextUrl, "#");
    }
  };

  const getSlugFromHash = () => {
    const hash = decodeURIComponent(window.location.hash.replace(/^#/, ""));

    if (!hash.startsWith("works/")) {
      return "";
    }

    return hash.split("/")[1] || "";
  };

  const getSlugFromPath = () => {
    const parts = window.location.pathname.split("/").filter(Boolean);
    const worksIndex = parts.lastIndexOf("works");

    if (worksIndex === -1) {
      return "";
    }

    return decodeURIComponent(parts[worksIndex + 1] || "");
  };

  const syncFromLocation = () => {
    const slug = getSlugFromHash() || getSlugFromPath();
    const work = works.get(slug);

    if (work) {
      setCurrentWork(work, null, false, false);
      return;
    }

    clearCurrentWork(false, false);
  };

  const handleDocumentClick = (event) => {
    const workLink = event.target.closest("[data-work-slug]");
    const homeLink = event.target.closest("[data-home-link]");

    if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
      return;
    }

    if (workLink) {
      const work = works.get(workLink.dataset.workSlug);

      if (!work) {
        return;
      }

      event.preventDefault();
      setCurrentWork(work, workLink.href, true);
      return;
    }

    if (homeLink) {
      event.preventDefault();
      collapseAllGroups();
      clearCurrentWork(true);
    }
  };

  walk(tree);
  renderTree();
  syncFromLocation();

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("popstate", syncFromLocation);
})();
