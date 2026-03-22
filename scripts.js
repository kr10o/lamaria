document.addEventListener('alpine:init', () => {
    Alpine.data('app', () => ({
        appConfig: null,
        appError: null,
        lang: 'en',
        isScrolled: false,
        isMobileMenuOpen: false,
        isCartOpen: false,
        cart: [],
        view: 'home',
        checkoutBundle: null,
        posts: [],
        currentPost: null,
        isLoadingPosts: true,
        activeCategory: null,
        originalTitle: document.title,

        async init() {
            let isTicking = false;
            window.addEventListener('scroll', () => {
                if (!isTicking) {
                    window.requestAnimationFrame(() => {
                        this.isScrolled = window.scrollY > 30;
                        isTicking = false;
                    });
                    isTicking = true;
                }
            }, { passive: true });
            
            this.$watch('view', (value) => {
                this.isMobileMenuOpen = false; 
                if (value === 'home') setTimeout(() => this.initScrollReveal(), 100);
            });

            try {
                const response = await fetch('https://raw.githubusercontent.com/kr10o/lamaria/refs/heads/main/data.json'); 
                if(response.ok) {
                    const data = JSON.parse(await response.text());
                    this.appConfig = data;
                    this.posts = data.posts || [];
                } else {
                    throw new Error("Failed to load data.json status=" + response.status);
                }
            } catch (e) { 
                console.error("Failed to fetch data:", e.message); 
                this.appError = e.message;
            } finally {
                this.isLoadingPosts = false;
                setTimeout(() => this.initScrollReveal(), 100);
            }

            this.handleRouting();
            window.addEventListener('popstate', () => {
                this.handleRouting();
            });
        },

        // Getters
        get products() { return this.appConfig ? this.appConfig.products : []; },
        get ugcItems() { return this.appConfig && this.appConfig.ugcItems ? this.appConfig.ugcItems : []; },
        get cartCount() { return this.cart.reduce((acc, i) => acc + i.qty, 0); },
        get cartTotal() { return this.cart.reduce((sum, i) => sum + (i.price * i.qty), 0).toFixed(2); },
        get allCategories() {
            const cats = new Set();
            this.posts.forEach(p => { if(p.categories) p.categories.forEach(c => cats.add(c)); });
            return Array.from(cats);
        },
        get filteredPosts() {
            if (!this.activeCategory) return this.posts;
            return this.posts.filter(p => p.categories && p.categories.includes(this.activeCategory));
        },
        get tr() { return this.appConfig ? this.appConfig.translations[this.lang] : {}; },

        // Methods
        toggleLang() { 
            this.lang = this.lang === 'en' ? 'hr' : 'en'; 
            this.isMobileMenuOpen = false;
        },
        goToView(v) {
            this.view = v;
            document.title = this.originalTitle;
            this.updateURL('');
            window.scrollTo(0, 0);
        },
        scrollToSection(id) {
            this.isMobileMenuOpen = false;
            if (this.view !== 'home') {
                this.view = 'home';
                this.updateURL('');
            }
            setTimeout(() => {
                const el = document.getElementById(id);
                if (el) window.scrollTo({ top: el.offsetTop - 80, behavior: 'smooth' });
            }, 50);
        },

        // Routing
        handleRouting() {
            const urlParams = new URLSearchParams(window.location.search);
            if (urlParams.get('post')) this.loadPostBySlug(urlParams.get('post'), false);
            else if (urlParams.get('category')) this.goToBlog(urlParams.get('category'), false);
            else if (this.view !== 'home' && this.view !== 'checkout') {
                this.view = 'home';
                document.title = this.originalTitle;
            }
        },
        goToBlog(category = null, pushState = true) {
            this.view = 'blog';
            this.activeCategory = category;
            let titleStr = category ? category.toUpperCase() + " - Blog" : "Blog";
            document.title = titleStr + " | " + this.originalTitle;
            if(pushState) this.updateURL(category ? "?category=" + category : "?blog");
            window.scrollTo(0, 0);
        },
        filterCategory(category) { this.goToBlog(category, true); },
        goToPost(slug) { this.loadPostBySlug(slug, true); },
        loadPostBySlug(slug, pushState) {
            const foundPost = this.posts.find(p => p.slug === slug);
            if (foundPost) {
                this.currentPost = foundPost;
                this.view = 'post';
                let titleStr = foundPost?.translations?.[this.lang]?.title || foundPost?.title || "Blog";
                document.title = titleStr + " | " + this.originalTitle;
                if (pushState) this.updateURL('?post=' + slug);
                window.scrollTo(0, 0);
            } else {
                this.currentPost = null;
                this.view = 'post'; 
            }
        },
        updateURL(queryString) {
            try {
                let baseUrl = window.location.origin + window.location.pathname;
                if (!baseUrl.startsWith('blob:')) window.history.pushState({ path: baseUrl + queryString }, '', baseUrl + queryString);
            } catch (e) { console.warn("Routing URL update skipped."); }
        },

        // Cart
        addToCart(product, heat) {
            const cartItemId = product.id + '-' + heat;
            const exist = this.cart.find(p => p.cartItemId === cartItemId);
            if (exist) exist.qty++;
            else this.cart.push({ ...product, qty: 1, heat: heat, cartItemId: cartItemId });
            this.isCartOpen = true;
        },
        updateCartQty(cartItemId, delta) {
            const item = this.cart.find(p => p.cartItemId === cartItemId);
            if (item) {
                item.qty += delta;
                if (item.qty <= 0) this.cart = this.cart.filter(p => p.cartItemId !== cartItemId);
            }
        },
        handleCheckout() {
            this.checkoutBundle = { items: [...this.cart], total: this.cartTotal };
            this.isCartOpen = false;
            this.view = 'checkout';
            window.scrollTo(0,0);
        },
        proceedToCarrd(e) {
            if(e) e.preventDefault();
            const itemsString = this.checkoutBundle.items.map(i => {
                const sub = (i.price * i.qty).toFixed(2);
                const name = this.tr.products?.[i.translationKey]?.name || 'Product';
                return `${i.qty}x ${name} (Heat: ${i.heat}/5) (€${sub})`;
            }).join(', ');
            const fullOrderDetails = `ORDER: ${itemsString} | TOTAL: €${this.checkoutBundle.total}`;
            const params = new URLSearchParams(window.location.search);
            params.set('pass', fullOrderDetails);
            window.location.href = window.location.pathname + `?${params.toString()}#kontakt`;
        },

        // Animations
        initScrollReveal() {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('revealed');
                        observer.unobserve(entry.target);
                    }
                });
            }, { threshold: 0.1 });
            setTimeout(() => document.querySelectorAll('.reveal').forEach(el => observer.observe(el)), 100);
        }
    }));
});

// Carrd Injector
window.addEventListener('DOMContentLoaded', function() {
    const orderData = new URLSearchParams(window.location.search).get('pass');
    const hiddenInput = document.querySelector('input[name="pass"]');
    if (orderData && hiddenInput) {
        hiddenInput.value = orderData;
        hiddenInput.dispatchEvent(new Event('input', { bubbles: true }));
        hiddenInput.dispatchEvent(new Event('change', { bubbles: true }));
    }
});