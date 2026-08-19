class MangaForFree extends ComicSource {

    name = "MangaForFree"
    key = "mangaforfree"
    version = "0.3.2"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venera-configs@main/mangaforfree.js"

    base = "https://mangaforfree.net"
    ajaxUrl = "https://mangaforfree.net/wp-admin/admin-ajax.php"

    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": this.base + "/",
        }
    }

    ajaxHeaders() {
        return { ...this.pageHeaders(), "X-Requested-With": "XMLHttpRequest", "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8" }
    }

    // 修复 // 开头 / 空地址 导致的 Scheme 报错
    normalizeUrl(u) {
        if (!u) return ""
        u = String(u).trim()
        if (u.startsWith("//")) return "https:" + u
        if (/^https?:\/\//i.test(u)) return u
        if (u.startsWith("/")) return this.base + u
        return u
    }

    slugFromUrl(url) {
        return url.replace(/\/+$/, "").split("/").pop()
    }

    // 通用漫画条目解析（兼容搜索页 .c-tabs-item__content 和列表页 .page-item-detail）
    parseComicItem(el) {
        let thumb = el.querySelector(".tab-thumb img, .item-thumb img, .thumb img, img")
        let cover = this.normalizeUrl(
            thumb?.attributes["data-src"] || thumb?.attributes["data-lazy-src"] || thumb?.attributes["src"] || ""
        )
        let linkEl = el.querySelector(".tab-summary .post-title h3 a, .item-summary .post-title h3 a, .tab-summary h3 a, .item-summary h3 a, h3 a, a")
        let url = linkEl?.attributes["href"] || ""
        let title = linkEl?.text?.trim() || ""
        if (!url || !title) return null
        return { id: this.slugFromUrl(url), title, subTitle: null, cover }
    }

    // 从分页器里算 maxPage
    parseMaxPage(doc) {
        let maxPage = 1
        doc.querySelectorAll(".wp-pagenavi a, .wp-pagenavi span, .page-numbers").forEach(a => {
            let n = parseInt(a.text?.trim())
            if (!isNaN(n) && n > maxPage) maxPage = n
        })
        return maxPage
    }

    // 抓一个 HTML 列表页的一组漫画
    async loadComicList(url) {
        let res = await Network.get(url, this.pageHeaders())
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let doc = new HtmlDocument(res.body)
        let comics = []
        doc.querySelectorAll(".c-tabs-item__content, .page-item-detail").forEach(el => {
            let item = this.parseComicItem(el)
            if (item) comics.push(item)
        })
        let maxPage = this.parseMaxPage(doc)
        doc.dispose()
        return { comics, maxPage }
    }

    // ============ 🆕 广场（探索页） ============
    explore = [
        {
            title: "MangaForFree",
            type: "multiPartPage",
            load: async (page) => {
                let sections = [
                    ["LATEST", `${this.base}/manga/?m_orderby=latest`],
                    ["TOP VIEWS", `${this.base}/manga/?m_orderby=views`],
                    ["NEW", `${this.base}/manga/?m_orderby=new-manga`],
                    ["COMPLETED", `${this.base}/manga-genre/completed/`],
                ]
                let parts = []
                for (let [title, url] of sections) {
                    try {
                        let { comics } = await this.loadComicList(url)
                        if (comics.length) parts.push({ title, comics })
                    } catch (e) { /* 某个板块失败不影响其他 */ }
                }
                return parts
            }
        }
    ]

    // ============ 🆕 分类页 ============
    category = {
        title: "MangaForFree",
        parts: [
            {
                name: "类型",
                type: "fixed",
                itemType: "category",
                categories: ["Action", "Adult", "Adventure", "Comedy", "Drama", "Ecchi", "Fantasy", "Harem", "Horror", "Manhua", "Manhwa", "Mature", "Mystery", "Psychological", "Romance", "School Life", "Sci-fi", "Seinen", "Slice of Life", "Smut", "Sports", "Supernatural", "Tragedy", "Webtoon", "Yaoi", "Yuri"],
                categoryParams: ["action", "adult", "adventure", "comedy", "drama", "ecchi", "fantasy", "harem", "horror", "manhua", "manhwa", "mature", "mystery", "psychological", "romance", "school-life", "sci-fi", "seinen", "slice-of-life", "smut", "sports", "supernatural", "tragedy", "webtoon", "yaoi", "yuri"],
            }
        ],
        enableRankingPage: false,
    }

    categoryComics = {
        load: async (category, param, options, page) => {
            let url = `${this.base}/manga-genre/${param}/`
            if (page > 1) url = `${this.base}/manga-genre/${param}/page/${page}/`
            let { comics, maxPage } = await this.loadComicList(url)
            return { comics, maxPage }
        }
    }

    // ============ 搜索（HTML 页，带封面+分页） ============
    search = {
        load: async (keyword, options, page) => {
            let url = page > 1
                ? `${this.base}/page/${page}/?s=${encodeURIComponent(keyword)}&post_type=wp-manga`
                : `${this.base}/?s=${encodeURIComponent(keyword)}&post_type=wp-manga`

            let { comics, maxPage } = await this.loadComicList(url)

            // 🔍 调试：看 App 是不是真的解析到了搜索结果（1 = 出问题）
            console.log(`[MangaForFree] search parsed ${comics.length} items`)

            // 兜底：HTML 没解析到 → 退回自动补全（无封面，仅保证能用）
            if (!comics.length) {
                let res2 = await Network.post(
                    this.ajaxUrl, this.ajaxHeaders(),
                    `action=wp-manga-search-manga&title=${encodeURIComponent(keyword)}`
                )
                let data = JSON.parse(res2.body)
                comics = (data.data || []).map(item => ({
                    id: this.slugFromUrl(item.url),
                    title: item.title,
                    subTitle: null,
                    cover: "",
                }))
                maxPage = 1
            }
            return { comics, maxPage }
        },
        optionList: []
    }

    // ============ 详情 ============
    async extractMangaId(pageHtml, respHeaders) {
        let link = respHeaders?.["link"] || respHeaders?.["Link"] || ""
        let m = link.match(/[?&]p=(\d+)/)
        if (m) return m[1]
        m = pageHtml.match(/rel=["']shortlink["'][^>]*href=["'][^"']*[?&]p=(\d+)/)
        if (m) return m[1]
        m = pageHtml.match(/[?&]p=(\d{4,7})/)
        if (m) return m[1]
        throw "无法从详情页提取 manga id"
    }

    async getChaptersByMangaId(mangaId) {
        let res = await Network.post(this.ajaxUrl, this.ajaxHeaders(), `action=manga_get_chapters&manga=${mangaId}`)
        if (res.status !== 200) throw `Invalid status code: ${res.status}`
        let doc = new HtmlDocument(res.body)
        let chapters = new Map()
        let seen = new Set()
        doc.querySelectorAll("ul.main.version-chap li.wp-manga-chapter > a").forEach(a => {
            let href = a.attributes["href"]
            let name = a.text.trim()
            if (!href || !name || seen.has(href)) return
            seen.add(href)
            chapters.set(this.slugFromUrl(href), name)
        })
        doc.dispose()
        return chapters
    }

    comic = {
        loadInfo: async (id) => {
            let res = await Network.get(`${this.base}/manga/${id}/`, this.pageHeaders())
            if (res.status !== 200) throw `Invalid status code: ${res.status}`
            let doc = new HtmlDocument(res.body)
            let title = doc.querySelector(".post-title h1")?.text?.trim() || id
            let coverEl = doc.querySelector(".summary_image img")
            let cover = this.normalizeUrl(
                coverEl?.attributes["data-src"] || coverEl?.attributes["data-lazy-src"] || coverEl?.attributes["src"] || ""
            )
            let desc = doc.querySelector(".summary__content")?.text?.trim()
                || doc.querySelector(".manga-excerpt")?.text?.trim() || ""
            let authors = doc.querySelectorAll(".author-content a").map(a => a.text.trim())
            let tags = doc.querySelectorAll(".genres-content a").map(a => a.text.trim())
            let status = doc.querySelector(".post-status .summary-content")?.text?.trim()
            doc.dispose()

            let mangaId = await this.extractMangaId(res.body, res.headers)
            let chapters = await this.getChaptersByMangaId(mangaId)
            if (!chapters.size) throw "未解析到章节列表"

            return new ComicDetails({
                id, title, cover, description: desc,
                tags: { "作者": authors, "状态": status ? [status] : [], "标签": tags },
                chapters,
            })
        },

        loadEp: async (comicId, epId) => {
            let res = await Network.get(`${this.base}/manga/${comicId}/${epId}/`, this.pageHeaders())
            if (res.status !== 200) throw `Invalid status code: ${res.status}`
            let doc = new HtmlDocument(res.body)
            let images = []
            doc.querySelectorAll(".reading-content img").forEach(img => {
                let src = this.normalizeUrl(
                    img.attributes["data-src"] || img.attributes["data-lazy-src"] || img.attributes["src"] || ""
                )
                if (src) images.push(src)
            })
            doc.dispose()
            if (!images.length) throw "未解析到图片"
            return { images }
        },
    }

    settings = {}
}
