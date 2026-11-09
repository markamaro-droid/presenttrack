/* Viewport coordinates throughout: never interpolate the target's geometry. */
(() => {
  class TourSpotlight {
    constructor(overlay) {
      this.overlay = overlay;
      this.tooltip = overlay.firstElementChild;
      document.body.appendChild(overlay);
      this.update = this.update.bind(this);
      this.tick = () => { this.update(); if (this.active) this.frame = requestAnimationFrame(this.tick); };
    }
    start(selector, title, description) {
      this.stop();
      this.selector = selector; this.active = true;
      this.tooltip.replaceChildren();
      const heading = document.createElement('strong'), detail = document.createElement('span');
      heading.textContent = title; detail.textContent = description;
      this.tooltip.append(heading, detail);
      this.observer = new ResizeObserver(this.update);
      this.observer.observe(document.documentElement);
      this.observer.observe(this.tooltip);
      addEventListener('scroll', this.update, { capture: true, passive: true });
      addEventListener('resize', this.update, { passive: true });
      window.visualViewport?.addEventListener('resize', this.update);
      window.visualViewport?.addEventListener('scroll', this.update);
      this.tick();
    }
    update() {
      if (!this.active) return;
      const el = document.querySelector(this.selector);
      if (el !== this.target) {
        if (this.target) this.observer.unobserve(this.target);
        this.target = el;
        if (el) {
          this.observer.observe(el);
          const phone = matchMedia('(max-width:767px), (max-height:500px) and (max-width:950px)').matches;
          el.scrollIntoView({ block: phone ? 'start' : 'center', inline: 'nearest', behavior: 'instant' });
        }
      }
      if (!el || !el.isConnected) { this.overlay.hidden = true; return; }
      const r = el.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
      if (r.width < 2 || r.height < 2 || r.bottom <= 0 || r.top >= vh || r.right <= 0 || r.left >= vw) {
        this.overlay.hidden = true; return;
      }
      this.overlay.hidden = false;
      const mobile = matchMedia('(max-width:767px), (max-height:500px) and (max-width:950px)').matches;
      if (mobile) {
        const header = document.getElementById('top')?.getBoundingClientRect();
        const dock = document.getElementById('tour')?.getBoundingClientRect();
        const top = Math.max(r.top - 4, (header?.bottom || 0) + 8);
        const bottom = Math.min(r.bottom + 4, dock?.top > 0 ? dock.top - 12 : vh - 12);
        const left = Math.max(6,r.left-4), right = Math.min(vw-6,r.right+4);
        this.overlay.hidden = bottom <= top || right <= left;
        Object.assign(this.overlay.style,{left:`${left}px`,top:`${top}px`,width:`${Math.max(0,right-left)}px`,height:`${Math.max(0,bottom-top)}px`});
        return;
      }
      Object.assign(this.overlay.style, { left: `${r.left - 8}px`, top: `${r.top - 8}px`, width: `${r.width + 16}px`, height: `${r.height + 16}px` });
      const box = this.tooltip.getBoundingClientRect();
      const left = Math.max(12, Math.min(r.left, vw - box.width - 12));
      const top = r.top >= box.height + 24 ? r.top - box.height - 16 : r.bottom + 16;
      Object.assign(this.tooltip.style, { left: `${left}px`, top: `${Math.max(12, Math.min(top, vh - box.height - 12))}px` });
    }
    stop() {
      this.active = false; cancelAnimationFrame(this.frame);
      this.observer?.disconnect(); this.target = null;
      removeEventListener('scroll', this.update, true); removeEventListener('resize', this.update);
      window.visualViewport?.removeEventListener('resize', this.update);
      window.visualViewport?.removeEventListener('scroll', this.update);
      this.overlay.hidden = true;
    }
  }
  window.PTTourSpotlight = TourSpotlight;
})();
