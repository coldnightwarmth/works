(() => {
  const tree = window.PORTFOLIO_TREE || [];
  const pages = window.PORTFOLIO_PAGES || {};
  const treeMount = document.querySelector("[data-work-tree]");
  const stageTarget = document.querySelector("[data-work-stage]") || document.querySelector(".work-stage");
  const basePath = document.body.dataset.basePath || "./";
  const siteRootUrl = new URL(basePath, window.location.href);
  const baseUrl = new URL("index.html", siteRootUrl);
  const works = new Map();
  const allWorks = [];
  const optimizedGalleryImages = window.PORTFOLIO_GALLERY_IMAGES || {};
  const openGroupsStorageKey = "meinong-portfolio-open-groups";
  const sortModeStorageKey = "meinong-portfolio-sort-mode";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let stageTransitionTimer = null;
  let activeLightboxCleanup = null;
  const preloadedImages = new Map();
  const loadedImageDetails = new Map();
  const hiResImageLoads = new Map();
  const priorityPreloadLinks = new Set();

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

  const getHref = (slug) => new URL(`works/${encodeURIComponent(slug)}/index.html`, siteRootUrl).href;

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

  const registerServiceWorker = () => {
    if (!("serviceWorker" in navigator) || window.location.protocol === "file:") {
      return;
    }

    window.addEventListener("load", () => {
      navigator.serviceWorker.register(new URL("sw.js", siteRootUrl).href).catch(() => {});
    }, { once: true });
  };

  const tensorImageCdn = (src, size = 400) =>
    `https://prod-image-cdn.tensor.trade/images/${size}x${size}/freeze=true/${encodeURIComponent(src)}`;

  const isAbsoluteUrl = (src) => /^[a-z][a-z\d+.-]*:|^\/\//i.test(src);

  const getAssetUrl = (src) => {
    if (!src || isAbsoluteUrl(src) || src.startsWith("/")) {
      return src;
    }

    return new URL(src.replace(/^\.\//, ""), siteRootUrl).href;
  };

  const getThumbnailUrl = (item, gallery) =>
    getAssetUrl(item.thumbSrc) || tensorImageCdn(item.src, gallery.thumbSize || 400);

  const getOptimizedGalleryImage = (item) =>
    item.optimizedKey ? optimizedGalleryImages[item.optimizedKey] : null;

  const shouldUseAnimatedHoverPreview = (item, gallery) => {
    const imageData = getOptimizedGalleryImage(item);

    return gallery.hoverPreview === "animated" && imageData?.animated === true;
  };

  const getResponsiveTargetSize = (details) => {
    const dpr = Math.min(2, Math.max(1, window.devicePixelRatio || 1));

    if (details) {
      const naturalWidth = Math.max(1, details.width || 1);
      const naturalHeight = Math.max(1, details.height || 1);
      const maxWidth = Math.min(window.innerWidth * 0.92, 1400);
      const maxHeight = Math.max(120, window.innerHeight * 0.88 - 32);
      const scale = Math.min(1, maxWidth / naturalWidth, maxHeight / naturalHeight);

      return Math.max(naturalWidth * scale, naturalHeight * scale) * dpr;
    }

    return Math.max(
      Math.min(window.innerWidth * 0.92, 1400),
      Math.max(120, window.innerHeight * 0.88 - 32)
    ) * dpr;
  };

  const chooseOptimizedVariant = (imageData) => {
    const variants = [...(imageData?.variants || [])].sort((a, b) => a.size - b.size);

    if (!variants.length) {
      return null;
    }

    const targetSize = getResponsiveTargetSize(imageData);

    return variants.find((variant) => variant.size >= targetSize) || variants[variants.length - 1];
  };

  const getFullImageSource = (item) => {
    const imageData = getOptimizedGalleryImage(item);
    const variant = chooseOptimizedVariant(imageData);

    if (variant?.src) {
      return {
        details: {
          height: variant.height || imageData.height || 1,
          width: variant.width || imageData.width || 1
        },
        src: getAssetUrl(variant.src)
      };
    }

    return {
      details: imageData ? {
        height: imageData.height || 1,
        width: imageData.width || 1
      } : null,
      src: getAssetUrl(item.fullSrc || item.src)
    };
  };

  const getFullImageUrl = (item) => getFullImageSource(item).src;

  const getHoverPreviewSource = (item, gallery) =>
    shouldUseAnimatedHoverPreview(item, gallery) ? getFullImageSource(item) : null;

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

  const priorityRank = {
    low: 0,
    auto: 1,
    high: 2
  };

  const getPriorityRank = (priority) => priorityRank[priority] ?? priorityRank.auto;

  const setFetchPriority = (image, priority) => {
    if ("fetchPriority" in image) {
      image.fetchPriority = priority;
    }
  };

  const addPriorityPreloadLink = (src, priority) => {
    if (!src || priority !== "high" || priorityPreloadLinks.has(src)) {
      return;
    }

    const link = document.createElement("link");
    link.rel = "preload";
    link.as = "image";
    link.href = src;

    if ("fetchPriority" in link) {
      link.fetchPriority = "high";
    }

    priorityPreloadLinks.add(src);
    document.head.append(link);
  };

  const preloadImage = (src, options = {}) => {
    if (!src) {
      return Promise.resolve();
    }

    const priority = options.priority || "auto";
    const rank = getPriorityRank(priority);
    const current = preloadedImages.get(src);

    addPriorityPreloadLink(src, priority);

    if (current && current.rank >= rank) {
      return current.promise;
    }

    const promise = new Promise((resolve) => {
      const image = new Image();

      image.decoding = "async";
      setFetchPriority(image, priority);
      image.onload = resolve;
      image.onerror = resolve;
      image.src = src;
    });

    preloadedImages.set(src, { promise, rank });
    return promise;
  };

  const loadImageDetails = (src, options = {}) => {
    if (!src) {
      return Promise.resolve({ width: 1, height: 1 });
    }

    const priority = options.priority || "auto";
    const rank = getPriorityRank(priority);
    const current = loadedImageDetails.get(src);

    addPriorityPreloadLink(src, priority);

    if (current && current.rank >= rank) {
      return current.promise;
    }

    const promise = new Promise((resolve) => {
      const image = new Image();

      image.decoding = "async";
      setFetchPriority(image, priority);
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

    loadedImageDetails.set(src, { promise, rank });
    return promise;
  };

  const readUint16 = (bytes, offset, littleEndian = false) => {
    if (offset + 1 >= bytes.length) {
      return 0;
    }

    return littleEndian
      ? bytes[offset] | (bytes[offset + 1] << 8)
      : (bytes[offset] << 8) | bytes[offset + 1];
  };

  const readUint24 = (bytes, offset) => {
    if (offset + 2 >= bytes.length) {
      return 0;
    }

    return (bytes[offset] << 16) | (bytes[offset + 1] << 8) | bytes[offset + 2];
  };

  const readUint32 = (bytes, offset, littleEndian = false) => {
    if (offset + 3 >= bytes.length) {
      return 0;
    }

    if (littleEndian) {
      return (
        (bytes[offset]) |
        (bytes[offset + 1] << 8) |
        (bytes[offset + 2] << 16) |
        (bytes[offset + 3] << 24)
      ) >>> 0;
    }

    return (
      (bytes[offset] << 24) |
      (bytes[offset + 1] << 16) |
      (bytes[offset + 2] << 8) |
      bytes[offset + 3]
    ) >>> 0;
  };

  const isJpegSofMarker = (marker) =>
    [
      0xc0, 0xc1, 0xc2, 0xc3,
      0xc5, 0xc6, 0xc7,
      0xc9, 0xca, 0xcb,
      0xcd, 0xce, 0xcf
    ].includes(marker);

  const parseImageDimensions = (bytes) => {
    if (bytes.length >= 24 &&
      bytes[0] === 0x89 &&
      bytes[1] === 0x50 &&
      bytes[2] === 0x4e &&
      bytes[3] === 0x47) {
      return {
        width: readUint32(bytes, 16),
        height: readUint32(bytes, 20)
      };
    }

    if (bytes.length >= 10 &&
      bytes[0] === 0x47 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46) {
      return {
        width: readUint16(bytes, 6, true),
        height: readUint16(bytes, 8, true)
      };
    }

    if (bytes.length >= 30 &&
      bytes[0] === 0x52 &&
      bytes[1] === 0x49 &&
      bytes[2] === 0x46 &&
      bytes[3] === 0x46 &&
      bytes[8] === 0x57 &&
      bytes[9] === 0x45 &&
      bytes[10] === 0x42 &&
      bytes[11] === 0x50) {
      const chunkType = String.fromCharCode(bytes[12], bytes[13], bytes[14], bytes[15]);

      if (chunkType === "VP8X" && bytes.length >= 30) {
        return {
          width: readUint24(bytes, 24) + 1,
          height: readUint24(bytes, 27) + 1
        };
      }

      if (chunkType === "VP8L" && bytes.length >= 25) {
        const bits = readUint32(bytes, 21, true);

        return {
          width: (bits & 0x3fff) + 1,
          height: ((bits >> 14) & 0x3fff) + 1
        };
      }

      if (chunkType === "VP8 " && bytes.length >= 30) {
        return {
          width: readUint16(bytes, 26, true) & 0x3fff,
          height: readUint16(bytes, 28, true) & 0x3fff
        };
      }
    }

    if (bytes.length >= 4 && bytes[0] === 0xff && bytes[1] === 0xd8) {
      let offset = 2;

      while (offset + 9 < bytes.length) {
        if (bytes[offset] !== 0xff) {
          offset += 1;
          continue;
        }

        while (bytes[offset] === 0xff) {
          offset += 1;
        }

        const marker = bytes[offset];
        offset += 1;

        if (marker === 0xd9 || marker === 0xda) {
          break;
        }

        if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
          continue;
        }

        if (offset + 1 >= bytes.length) {
          break;
        }

        const segmentLength = readUint16(bytes, offset);

        if (segmentLength < 2 || offset + segmentLength > bytes.length) {
          break;
        }

        if (isJpegSofMarker(marker) && offset + 7 < bytes.length) {
          return {
            height: readUint16(bytes, offset + 3),
            width: readUint16(bytes, offset + 5)
          };
        }

        offset += segmentLength;
      }
    }

    return null;
  };

  const mergeInitialBytes = (current, chunk, limit = 65536) => {
    if (current.length >= limit) {
      return current;
    }

    const available = Math.min(chunk.length, limit - current.length);
    const merged = new Uint8Array(current.length + available);

    merged.set(current);
    merged.set(chunk.slice(0, available), current.length);
    return merged;
  };

  const getImageDetailsFromUrl = (src) =>
    new Promise((resolve) => {
      const image = new Image();

      image.decoding = "async";
      image.onload = () => {
        resolve({
          width: image.naturalWidth || 1,
          height: image.naturalHeight || 1
        });
      };
      image.onerror = () => resolve({ width: 1, height: 1 });
      image.src = src;
    });

  const getHighResSnapshot = (record) => ({
    details: record.details,
    error: record.error,
    loaded: record.loaded,
    objectUrl: record.objectUrl,
    progress: record.total ? Math.min(100, (record.loaded / record.total) * 100) : 0,
    src: record.src,
    status: record.status,
    total: record.total
  });

  const notifyHighResLoad = (record) => {
    const snapshot = getHighResSnapshot(record);

    record.listeners.forEach((listener) => listener(snapshot));
  };

  const createHighResLoadRecord = (src, options = {}) => {
    const priority = options.priority || "auto";
    const record = {
      details: options.details || null,
      error: null,
      loaded: 0,
      listeners: new Set(),
      objectUrl: "",
      promise: null,
      rank: getPriorityRank(priority),
      src,
      status: "loading",
      total: 0
    };

    record.promise = (async () => {
      try {
        const response = await fetch(src, {
          cache: "force-cache",
          credentials: "omit",
          mode: "cors",
          priority
        });

        if (!response.ok) {
          throw new Error(`Image request failed: ${response.status}`);
        }

        const total = Number(response.headers.get("content-length") || response.headers.get("x-content-length") || 0);
        const contentType = response.headers.get("content-type") || "";
        const chunks = [];
        let initialBytes = new Uint8Array();

        record.total = Number.isFinite(total) ? total : 0;
        notifyHighResLoad(record);

        if (!response.body || !response.body.getReader) {
          const blob = await response.blob();

          record.loaded = blob.size;
          record.total = record.total || blob.size;
          record.objectUrl = URL.createObjectURL(blob);
          record.status = "decoding";
          notifyHighResLoad(record);
          record.details = await getImageDetailsFromUrl(record.objectUrl);
          record.status = "loaded";
          notifyHighResLoad(record);
          return record;
        }

        const reader = response.body.getReader();

        while (true) {
          const { done, value } = await reader.read();

          if (done) {
            break;
          }

          chunks.push(value);
          record.loaded += value.byteLength;

          if (!record.details) {
            initialBytes = mergeInitialBytes(initialBytes, value);
            record.details = parseImageDimensions(initialBytes);
          }

          notifyHighResLoad(record);
        }

        const blob = new Blob(chunks, { type: contentType });

        record.loaded = blob.size || record.loaded;
        record.total = record.total || blob.size;
        record.objectUrl = URL.createObjectURL(blob);
        record.status = "decoding";
        notifyHighResLoad(record);
        record.details = record.details || await getImageDetailsFromUrl(record.objectUrl);
        record.status = "loaded";
        notifyHighResLoad(record);
        return record;
      } catch (error) {
        record.error = error;
        record.status = "error";
        notifyHighResLoad(record);
        return record;
      }
    })();

    return record;
  };

  const loadHighResImage = (src, options = {}) => {
    if (!src) {
      return null;
    }

    const priority = options.priority || "auto";
    const rank = getPriorityRank(priority);
    let record = hiResImageLoads.get(src);

    if (record && record.status === "error" && rank >= record.rank) {
      hiResImageLoads.delete(src);
      record = null;
    }

    if (!record) {
      record = createHighResLoadRecord(src, options);
      hiResImageLoads.set(src, record);
      return record;
    }

    record.rank = Math.max(record.rank, rank);
    return record;
  };

  const watchHighResImage = (src, options, listener) => {
    const record = loadHighResImage(src, options);

    if (!record) {
      return () => {};
    }

    record.listeners.add(listener);
    listener(getHighResSnapshot(record));

    return () => {
      record.listeners.delete(listener);
    };
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

  const canUseCardTilt = (event) =>
    event.pointerType !== "touch" &&
    !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const getCardTiltStrength = (target, mode = "gallery") => {
    const rect = target.getBoundingClientRect();
    const shortEdge = Math.max(1, Math.min(rect.width || 1, rect.height || 1));
    const baseline = mode === "expanded" ? 10 : 13;
    const reference = mode === "expanded" ? 760 : 300;
    const bonusLimit = mode === "expanded" ? 4 : 16;
    const divisor = mode === "expanded" ? 220 : 190;
    const bonus = Math.max(0, Math.min(bonusLimit, ((reference - shortEdge) / divisor) * bonusLimit));

    return baseline + bonus;
  };

  const getHorizontalCardTiltMultiplier = (mode) =>
    mode === "expanded" ? 1.25 : 1.45;

  const clampUnit = (value) => Math.max(0, Math.min(1, value));

  const updateCardTilt = (target, event, mode = "gallery", options = {}) => {
    if (!canUseCardTilt(event)) {
      return;
    }

    const rect = target.getBoundingClientRect();
    const tiltScale = Number.isFinite(options.tiltScale) ? options.tiltScale : 1;
    const maxTilt = getCardTiltStrength(target, mode) * tiltScale;
    const horizontalTiltMultiplier = getHorizontalCardTiltMultiplier(mode);
    const rawX = (event.clientX - rect.left) / rect.width;
    const rawY = (event.clientY - rect.top) / rect.height;
    const x = options.clampToTarget ? clampUnit(rawX) : rawX;
    const y = options.clampToTarget ? clampUnit(rawY) : rawY;
    const rotateY = (x - 0.5) * maxTilt * 2 * horizontalTiltMultiplier;
    const rotateX = (0.5 - y) * maxTilt * 2;

    target.style.setProperty(
      "--card-tilt-transform",
      `rotateX(${rotateX.toFixed(2)}deg) rotateY(${rotateY.toFixed(2)}deg)`
    );
  };

  const resetCardTilt = (target) => {
    target.style.removeProperty("--card-tilt-transform");
  };

  const isPointerInsideInflatedRect = (event, target, padding) => {
    const rect = target.getBoundingClientRect();

    return event.clientX >= rect.left - padding &&
      event.clientX <= rect.right + padding &&
      event.clientY >= rect.top - padding &&
      event.clientY <= rect.bottom + padding;
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
    const imageFrame = document.createElement("div");
    const previewImage = document.createElement("img");
    const fullImage = document.createElement("img");
    const progress = document.createElement("span");
    const progressFill = document.createElement("span");
    const caption = document.createElement("figcaption");
    let currentIndex = Math.min(Math.max(startIndex, 0), Math.max(items.length - 1, 0));
    let currentImageDetails = null;
    let lightboxRequestId = 0;
    let stopWatchingHighRes = null;

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
    imageFrame.className = "lightbox-image-frame";
    previewImage.className = "lightbox-preview-image";
    previewImage.alt = "";
    previewImage.decoding = "async";
    previewImage.setAttribute("aria-hidden", "true");
    previewImage.hidden = true;
    fullImage.className = "lightbox-full-image";
    fullImage.decoding = "async";
    fullImage.hidden = true;
    progress.className = "lightbox-progress";
    progress.setAttribute("aria-hidden", "true");
    progressFill.className = "lightbox-progress-fill";
    caption.className = "lightbox-caption";

    progress.append(progressFill);
    imageFrame.append(previewImage, fullImage, progress);
    mediaWrap.append(imageFrame, caption);
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
      const imageBounds = targetBounds || (
        currentImageDetails
          ? getLightboxImageBounds(currentImageDetails)
          : imageFrame.getBoundingClientRect()
      );

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

      imageFrame.style.width = `${bounds.width}px`;
      imageFrame.style.height = `${bounds.height}px`;
      positionLightboxNavigation(bounds);
    };

    const setLightboxProgress = (percent) => {
      const clamped = Math.min(100, Math.max(0, percent));

      progressFill.style.transform = `scaleX(${clamped / 100})`;
    };

    const resetLightboxProgress = () => {
      progress.classList.remove("is-progress-unknown");
      progress.removeAttribute("aria-valuenow");
      setLightboxProgress(0);
    };

    const updateLightboxProgress = (snapshot) => {
      if (!snapshot.total) {
        progress.classList.add("is-progress-unknown");
        progress.removeAttribute("aria-valuenow");
        setLightboxProgress(0);
        return;
      }

      progress.classList.remove("is-progress-unknown");
      progress.setAttribute("aria-valuenow", String(Math.round(snapshot.progress)));
      setLightboxProgress(snapshot.progress);
    };

    const finishLightboxProgress = (requestId) => {
      if (requestId !== lightboxRequestId) {
        return;
      }

      setLightboxProgress(100);
      window.setTimeout(() => {
        if (requestId === lightboxRequestId) {
          resetLightboxProgress();
        }
      }, 180);
    };

    const stopHighResWatcher = () => {
      if (stopWatchingHighRes) {
        stopWatchingHighRes();
        stopWatchingHighRes = null;
      }
    };

    const lightboxUsesCardTilt = () => Boolean(options.cardTilt || (items[currentIndex] || item).cardTilt);

    const revealFullImageFromUrl = (src, requestId) => {
      let didRevealFullImage = false;

      const revealFullImage = () => {
        if (didRevealFullImage || requestId !== lightboxRequestId || !document.body.contains(overlay)) {
          return;
        }

        didRevealFullImage = true;
        finishLightboxProgress(requestId);
        overlay.classList.remove("is-measuring");
        mediaWrap.classList.remove("is-loading");
        mediaWrap.removeAttribute("aria-busy");
        window.requestAnimationFrame(() => {
          if (requestId === lightboxRequestId) {
            fullImage.classList.add("is-visible");
          }
        });

        window.setTimeout(() => {
          if (requestId !== lightboxRequestId) {
            return;
          }

          previewImage.classList.remove("is-visible");
          previewImage.hidden = true;
        }, 420);
      };

      setFetchPriority(fullImage, "high");
      fullImage.classList.remove("is-visible");
      fullImage.addEventListener("load", revealFullImage, { once: true });
      fullImage.addEventListener("error", revealFullImage, { once: true });
      fullImage.src = src;
      fullImage.hidden = false;

      if (fullImage.complete) {
        revealFullImage();
      }
    };

    const updateLightboxExternalLink = (currentItem, label) => {
      const externalUrl = currentItem.externalUrl || currentItem.url;
      const externalIcon = currentItem.externalIcon || options.externalIcon;
      const externalLabel = currentItem.externalLabel || options.externalLabel || "external site";

      if (externalUrl) {
        itemLink.href = externalUrl;
        itemLink.hidden = false;
        itemLink.setAttribute(
          "aria-label",
          `open ${label} on ${externalLabel}`
        );
        itemLink.classList.toggle("has-exchange-art-icon", externalLabel === "exchange.art");

        if (externalIcon) {
          itemLink.classList.add("has-external-icon");
          itemLinkIcon.src = getAssetUrl(externalIcon);
          itemLink.replaceChildren(itemLinkIcon);
        } else {
          itemLink.classList.remove("has-external-icon");
          itemLink.classList.remove("has-exchange-art-icon");
          itemLink.textContent = "↑";
        }
      } else {
        itemLink.hidden = true;
        itemLink.removeAttribute("href");
        itemLink.classList.remove("has-external-icon", "has-exchange-art-icon");
      }
    };

    const updateLightboxImage = () => {
      const requestId = ++lightboxRequestId;
      const currentItem = items[currentIndex] || item;
      const label = currentItem.title || title;
      const fullSource = getFullImageSource(currentItem);
      const src = fullSource.src;
      const previewSrc = options.getPreviewSrc ? options.getPreviewSrc(currentItem) : "";
      const shouldTiltCard = lightboxUsesCardTilt();
      let didSetFullImage = false;
      let didShowPreview = false;
      let isPreviewReady = false;

      stopHighResWatcher();
      mediaWrap.classList.toggle("has-card-tilt", shouldTiltCard);
      imageFrame.classList.toggle("has-card-tilt", shouldTiltCard);
      resetCardTilt(imageFrame);
      previewImage.hidden = true;
      previewImage.removeAttribute("src");
      previewImage.classList.remove("is-visible");
      fullImage.hidden = true;
      fullImage.removeAttribute("src");
      fullImage.classList.remove("is-visible");
      fullImage.alt = label;
      imageFrame.style.removeProperty("width");
      imageFrame.style.removeProperty("height");
      caption.textContent = label;
      overlay.setAttribute("aria-label", label);
      overlay.classList.add("is-measuring");
      mediaWrap.classList.add("is-loading");
      mediaWrap.setAttribute("aria-busy", "true");
      currentImageDetails = null;
      resetLightboxProgress();
      updateLightboxExternalLink(currentItem, label);

      if (fullSource.details) {
        currentImageDetails = fullSource.details;
        applyLightboxImageSize(fullSource.details);
      }

      const maybeShowPreview = () => {
        if (
          didShowPreview ||
          didSetFullImage ||
          !isPreviewReady ||
          !currentImageDetails ||
          requestId !== lightboxRequestId ||
          !document.body.contains(overlay)
        ) {
          return;
        }

        didShowPreview = true;
        setFetchPriority(previewImage, "high");
        previewImage.src = previewSrc;
        previewImage.hidden = false;
        overlay.classList.remove("is-measuring");
        window.requestAnimationFrame(() => {
          if (requestId === lightboxRequestId) {
            previewImage.classList.add("is-visible");
          }
        });
      };

      if (options.onIndexChange) {
        options.onIndexChange(currentIndex, currentItem);
      }

      if (previewSrc && previewSrc !== src) {
        loadImageDetails(previewSrc, { priority: "high" }).then(() => {
          if (requestId !== lightboxRequestId || didSetFullImage || !document.body.contains(overlay)) {
            return;
          }

          isPreviewReady = true;
          maybeShowPreview();
        });
      }

      previousButton.disabled = currentIndex <= 0;
      nextButton.disabled = currentIndex >= items.length - 1;

      const showFallbackImage = () => {
        loadImageDetails(src, { priority: "high" }).then((details) => {
          if (requestId !== lightboxRequestId || didSetFullImage || !document.body.contains(overlay)) {
            return;
          }

          currentImageDetails = details;
          applyLightboxImageSize(details);
          didSetFullImage = true;
          revealFullImageFromUrl(src, requestId);
        });
      };

      stopWatchingHighRes = watchHighResImage(src, { priority: "high", details: fullSource.details }, (snapshot) => {
        if (requestId !== lightboxRequestId || !document.body.contains(overlay)) {
          return;
        }

        updateLightboxProgress(snapshot);

        if (snapshot.details && (
          !currentImageDetails ||
          currentImageDetails.width !== snapshot.details.width ||
          currentImageDetails.height !== snapshot.details.height
        )) {
          currentImageDetails = snapshot.details;
          applyLightboxImageSize(snapshot.details);
          overlay.classList.remove("is-measuring");
          maybeShowPreview();
        }

        if (snapshot.status === "loaded" && snapshot.objectUrl && !didSetFullImage) {
          didSetFullImage = true;

          if (snapshot.details) {
            currentImageDetails = snapshot.details;
            applyLightboxImageSize(snapshot.details);
          }

          revealFullImageFromUrl(snapshot.objectUrl, requestId);
        } else if (snapshot.status === "error" && !didSetFullImage) {
          progress.classList.add("is-progress-unknown");
          showFallbackImage();
        }
      });

      [
        items[currentIndex + 1],
        items[currentIndex - 1]
      ].filter(Boolean).forEach((adjacentItem, index) => {
        schedulePreload(() => {
          if (requestId === lightboxRequestId) {
            const adjacentSource = getFullImageSource(adjacentItem);

            loadHighResImage(adjacentSource.src, { priority: "low", details: adjacentSource.details });
          }
        }, 700 + index * 240);
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
      stopHighResWatcher();
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

    previousButton.addEventListener("click", (event) => {
      event.stopPropagation();
      showAdjacentImage(-1);
    });
    nextButton.addEventListener("click", (event) => {
      event.stopPropagation();
      showAdjacentImage(1);
    });
    overlay.addEventListener("pointermove", (event) => {
      if (!lightboxUsesCardTilt()) {
        return;
      }

      if (isPointerInsideInflatedRect(event, imageFrame, 26)) {
        updateCardTilt(imageFrame, event, "expanded", { clampToTarget: true });
      } else {
        resetCardTilt(imageFrame);
      }
    });
    overlay.addEventListener("pointerleave", () => resetCardTilt(imageFrame));
    document.addEventListener("keydown", onKeyDown);
    window.addEventListener("resize", resizeLightboxImage);
    updateLightboxImage();
  };

  const buildGalleryPage = (work, page) => {
    const gallery = page.gallery || {};
    const sourceItems = gallery.items || [];
    const showSort = gallery.showSort !== false;
    const showPagination = gallery.showPagination !== false;
    const showZoom = gallery.showZoom !== false;
    const defaultGallerySortMode = gallery.defaultSortMode === "ordered" || !showSort ? "ordered" : "random";
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
    const heading = document.createElement("div");
    const title = document.createElement("h2");
    const description = document.createElement("p");
    const itemCount = document.createElement("span");
    let gallerySortMode = defaultGallerySortMode;
    let galleryItems = [];
    let zoomIndex = defaultZoomIndex;
    let pageIndex = 0;
    let pageSize = 1;
    let pageCount = 1;

    article.className = "work-page gallery-page";
    article.dataset.galleryThumbnailFit = gallery.thumbnailFit === "contain" ? "contain" : "cover";

    if (gallery.cardTilt) {
      article.dataset.galleryCardTilt = "true";
    }

    grid.className = "gallery-grid";

    if (Number.isFinite(gallery.gap)) {
      grid.style.setProperty("--gallery-gap", `${Math.max(0, gallery.gap)}px`);
    }

    if (gallery.itemAspectRatio) {
      grid.style.setProperty("--gallery-item-aspect-ratio", gallery.itemAspectRatio);
    }

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
    heading.className = "gallery-heading";
    title.className = "gallery-title";
    title.textContent = page.title || work.title;

    description.className = "gallery-description";
    description.textContent = page.description || "";
    itemCount.className = "gallery-item-count";
    {
      const displayItemCount = Number.isFinite(page.itemCount) ? page.itemCount : sourceItems.length;

      itemCount.textContent = `${displayItemCount} ${displayItemCount === 1 ? "piece" : "pieces"}`;
    }

    heading.append(title, itemCount);
    copy.append(heading);

    if (page.description) {
      copy.append(description);
    }

    footer.append(copy);

    if (page.externalUrl) {
      const createGalleryExternalLink = (url, options = {}) => {
        const external = document.createElement("a");

        external.className = "gallery-external-link";
        external.href = url;
        external.target = "_blank";
        external.rel = "noreferrer";
        external.setAttribute(
          "aria-label",
          options.label ? `open ${work.title} on ${options.label}` : `open ${work.title} externally`
        );

        if (options.icon) {
          const icon = document.createElement("img");

          external.classList.add("has-external-icon");

          if (options.iconClass) {
            external.classList.add(`has-${options.iconClass}-icon`);
          }

          icon.src = getAssetUrl(options.icon);
          icon.alt = "";
          icon.decoding = "async";
          external.append(icon);
        } else if (options.text) {
          const externalText = document.createElement("span");

          external.classList.add("has-external-text");
          externalText.textContent = options.text;
          external.append(externalText);
        } else {
          external.textContent = "↑";
        }

        return external;
      };
      const prefixLinks = Array.isArray(page.externalLinksBefore)
        ? page.externalLinksBefore.map((link) => createGalleryExternalLink(link.url, {
          icon: link.icon,
          iconClass: link.iconClass,
          label: link.label,
          text: link.text
        }))
        : [];
      const primaryExternal = createGalleryExternalLink(page.externalUrl, {
        icon: page.externalIcon,
        iconClass: page.externalIconClass,
        text: page.externalText
      });

      if (page.externalNote || prefixLinks.length) {
        const externalWrap = document.createElement("div");
        const externalNote = document.createElement("span");

        externalWrap.className = "gallery-external-wrap";

        if (page.externalNote) {
          externalNote.className = "gallery-external-note";
          externalNote.textContent = page.externalNote;
          externalWrap.append(externalNote);
        }

        externalWrap.append(...prefixLinks, primaryExternal);
        footer.append(externalWrap);
      } else {
        footer.append(primaryExternal);
      }
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

    const preloadGalleryPage = (targetPageIndex, mode, options = {}) => {
      if (targetPageIndex < 0 || targetPageIndex >= pageCount) {
        return;
      }

      const start = targetPageIndex * pageSize;
      const pageItems = galleryItems.slice(start, start + pageSize);
      const itemsToPreload = mode === "full" ? pageItems.slice(0, options.limit || 4) : pageItems;

      itemsToPreload.forEach((item, index) => {
        const delayBase = options.delayBase || 0;
        const delay = delayBase + (mode === "full" ? index * 280 : index * 18);

        schedulePreload(() => {
          if (mode === "full") {
            const fullSource = getFullImageSource(item);

            loadHighResImage(fullSource.src, {
              priority: options.priority || "low",
              details: fullSource.details
            });
          } else {
            preloadImage(getThumbnailUrl(item, gallery), { priority: options.priority || "auto" });
          }
        }, delay);
      });
    };

    const preloadAroundCurrentPage = () => {
      preloadGalleryPage(pageIndex + 1, "thumb", { priority: "high" });
      preloadGalleryPage(pageIndex - 1, "thumb", { priority: "low", delayBase: 180 });
      preloadGalleryPage(pageIndex + 2, "thumb", { priority: "low", delayBase: 360 });
      preloadGalleryPage(pageIndex, "full", { priority: "low", delayBase: 2200, limit: Math.min(1, pageSize) });
    };

    const warmFullImage = (targetItem, priority = "high") => {
      const fullSource = getFullImageSource(targetItem);

      return loadHighResImage(fullSource.src, { priority, details: fullSource.details });
    };

    const syncPageToLightboxIndex = (targetIndex) => {
      const nextPageIndex = Math.floor(targetIndex / pageSize);

      if (nextPageIndex === pageIndex) {
        return;
      }

      pageIndex = Math.min(pageCount - 1, Math.max(0, nextPageIndex));
      renderPage();
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
        const hoverImage = document.createElement("img");
        const loadingIndicator = document.createElement("span");
        const hoverPreviewSource = shouldUseFullImage ? null : getHoverPreviewSource(item, gallery);
        const hoverPreviewUrl = hoverPreviewSource?.src || "";
        let isLoaded = false;
        let isHoveringPreview = false;
        let hoverPreviewRequestId = 0;
        let stopWatchingHoverPreview = null;

        button.className = "gallery-item";
        button.type = "button";
        button.setAttribute("aria-label", `expand ${item.title || work.title}`);

        image.alt = item.title || work.title;
        image.loading = "eager";
        image.decoding = "async";
        setFetchPriority(image, index < Math.min(pageSize, 12) ? "high" : "auto");

        hoverImage.className = "gallery-hover-image";
        hoverImage.alt = "";
        hoverImage.decoding = "async";
        hoverImage.setAttribute("aria-hidden", "true");
        setFetchPriority(hoverImage, "high");

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

        if (shouldUseFullImage) {
          warmFullImage(item, "high");
        }

        if (image.complete) {
          markLoaded();
        }

        let lastLightboxOpenAt = -Infinity;
        const openGalleryLightbox = () => {
          const now = window.performance.now();

          if (now - lastLightboxOpenAt < 650) {
            return;
          }

          lastLightboxOpenAt = now;
          warmFullImage(item, "high");
          openLightbox(item, work.title, galleryItems, start + index, {
            cardTilt: gallery.cardTilt === true,
            externalIcon: page.externalIcon,
            externalLabel: page.externalLabel || "Tensor",
            getPreviewSrc: (galleryItem) => getThumbnailUrl(galleryItem, gallery),
            onIndexChange: syncPageToLightboxIndex
          });
        };

        const showHoverPreview = () => {
          if (!hoverPreviewUrl || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
            return;
          }

          isHoveringPreview = true;
          const requestId = ++hoverPreviewRequestId;

          if (hoverImage.dataset.loadedSrc === hoverPreviewUrl) {
            hoverImage.classList.add("is-visible");
            return;
          }

          hoverImage.classList.remove("is-visible");

          if (stopWatchingHoverPreview) {
            stopWatchingHoverPreview();
          }

          const revealHoverPreview = (src) => {
            if (!src || requestId !== hoverPreviewRequestId) {
              return;
            }

            hoverImage.addEventListener("load", () => {
              hoverImage.dataset.loadedSrc = hoverPreviewUrl;

              if (isHoveringPreview && requestId === hoverPreviewRequestId) {
                window.requestAnimationFrame(() => hoverImage.classList.add("is-visible"));
              }
            }, { once: true });
            hoverImage.addEventListener("error", () => {
              if (requestId === hoverPreviewRequestId) {
                hoverImage.dataset.loadedSrc = "";
              }
            }, { once: true });
            hoverImage.src = src;
          };

          stopWatchingHoverPreview = watchHighResImage(
            hoverPreviewUrl,
            { priority: "high", details: hoverPreviewSource?.details },
            (snapshot) => {
              if (requestId !== hoverPreviewRequestId) {
                return;
              }

              if (snapshot.status === "loaded" && snapshot.objectUrl) {
                revealHoverPreview(snapshot.objectUrl);
              } else if (snapshot.status === "error") {
                revealHoverPreview(hoverPreviewUrl);
              }
            }
          );
        };

        const hideHoverPreview = () => {
          isHoveringPreview = false;
          hoverPreviewRequestId += 1;
          hoverImage.classList.remove("is-visible");

          if (stopWatchingHoverPreview) {
            stopWatchingHoverPreview();
            stopWatchingHoverPreview = null;
          }
        };

        button.append(image);

        if (hoverPreviewUrl) {
          button.append(hoverImage);
        }

        button.append(loadingIndicator);
        button.addEventListener("pointerenter", (event) => {
          warmFullImage(item, "high");

          if (event.pointerType !== "touch" && event.pointerType !== "pen") {
            showHoverPreview();
          }
        });
        button.addEventListener("pointermove", (event) => {
          if (gallery.cardTilt) {
            updateCardTilt(button, event, "gallery", {
              tiltScale: pageSize === 1 ? 1 : 0.9
            });
          }
        });
        button.addEventListener("pointerleave", () => {
          resetCardTilt(button);
          hideHoverPreview();
        });
        button.addEventListener("pointerdown", (event) => {
          warmFullImage(item, "high");

          if (event.pointerType !== "touch" && event.pointerType !== "pen") {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
        });
        button.addEventListener("focus", () => warmFullImage(item, "high"));
        button.addEventListener("touchstart", () => warmFullImage(item, "high"), { passive: true });
        button.addEventListener("pointerup", (event) => {
          const isTouchLike = event.pointerType === "touch" || event.pointerType === "pen";

          if (event.isPrimary === false || (!isTouchLike && event.button !== 0)) {
            return;
          }

          event.preventDefault();
          event.stopPropagation();
          openGalleryLightbox();
        });
        button.addEventListener("touchend", (event) => {
          event.preventDefault();
          event.stopPropagation();
          openGalleryLightbox();
        }, { passive: false });
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

    if (showSort) {
      controls.append(sortControl);
    }

    if (showPagination) {
      controls.append(pagination);
    }

    if (showZoom) {
      controls.append(zoomControls);
    }

    if (!showSort && !showPagination && !showZoom) {
      controls.classList.add("is-empty");
    }

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
      document.title = work.title;
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

  const updateStaticLinks = () => {
    document.querySelectorAll("[data-home-link]").forEach((link) => {
      link.href = baseUrl.href;
    });
  };

  walk(tree);
  registerServiceWorker();
  updateStaticLinks();
  renderTree();
  syncFromLocation();

  document.addEventListener("click", handleDocumentClick);
  window.addEventListener("popstate", syncFromLocation);
})();
