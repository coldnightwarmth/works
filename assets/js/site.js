(() => {
  const tree = window.PORTFOLIO_TREE || [];
  const treeMount = document.querySelector("[data-work-tree]");
  const titleTarget = document.querySelector("[data-work-title]");
  const basePath = document.body.dataset.basePath || "./";
  const baseUrl = new URL(`${basePath}index.html`, window.location.href);
  const works = new Map();
  const openGroupsStorageKey = "meinong-portfolio-open-groups";
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
  let titleTransitionTimer = null;

  const loadOpenGroups = () => {
    try {
      return new Set(JSON.parse(localStorage.getItem(openGroupsStorageKey) || "[]"));
    } catch {
      return new Set();
    }
  };

  const openGroups = loadOpenGroups();

  const saveOpenGroups = () => {
    try {
      localStorage.setItem(openGroupsStorageKey, JSON.stringify([...openGroups]));
    } catch {
      // Keep navigation usable if localStorage is unavailable.
    }
  };

  const walk = (nodes) => {
    nodes.forEach((node) => {
      if (node.slug) {
        works.set(node.slug, node);
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
      button.textContent = group.title;
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

  const renderTree = () => {
    if (!treeMount) {
      return;
    }

    const root = document.createElement("ul");
    root.className = "tree-root";

    tree.forEach((group) => {
      root.append(buildGroupNode(group));
    });

    treeMount.replaceChildren(root);
  };

  const transitionTitle = (render, shouldTransition) => {
    if (!titleTarget || !shouldTransition || prefersReducedMotion.matches) {
      render();
      return;
    }

    window.clearTimeout(titleTransitionTimer);
    titleTarget.classList.add("is-transitioning");

    titleTransitionTimer = window.setTimeout(() => {
      render();
      requestAnimationFrame(() => {
        titleTarget.classList.remove("is-transitioning");
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
    if (!titleTarget) {
      return;
    }

    transitionTitle(() => {
      titleTarget.hidden = false;
      titleTarget.textContent = work.title;
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
    transitionTitle(() => {
      titleTarget.hidden = true;
      titleTarget.textContent = "";
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
