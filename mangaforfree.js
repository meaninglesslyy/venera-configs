class MangaForFree extends ComicSource {

    name = "MangaForFree"
    key = "mangaforfree"
    version = "0.3.0"
    minAppVersion = "1.6.0"
    url = "https://cdn.jsdelivr.net/gh/meaninglesslyy/venara@main/mangaforfree.js"

    base = "https://mangaforfree.net"
    ajaxUrl = "https://mangaforfree.net/wp-admin/admin-ajax.php"

    // 抓 HTML 页面用的头（不带 X-Requested-With）
    pageHeaders() {
        return {
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36",
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Referer": this.base + "/",
        }
    }

    // 调 AJAX 用的头
    ajaxHeaders() {
        return {
            ...this.pageHeaders(),
            "X-Requested-With": "XMLHttpRequest",
            "Content-Type": "application/x-www-form-urlencoded; charset=UTF-8",
        }
    }

    slugFromUrl(url) {
        return url.replace(/\/+$/, "").split("/").pop()
    }

    // ============ 搜索：HTML 搜索页（带封面+分页） ============
    parseSearchItem(el) {
        let thumb = el.querySelector(".tab-thumb img, .item-thumb img, .thumb img, img")
        let cover = thumb?.attributes["data-src"]
            || thumb?.attributes["data-lazy-src"]
            || thumb?.attributes["src"]
            || ""
        let linkEl = el.querySelector(".tab-summary h3 a, .item-summary h3 a, h3 a, a")
        let url = linkEl?.attributes["href"] || ""
        let title = linkEl?.text?.trim() || ""
        if (!url || !title) return null
        return { id: this.slugFromUrl(url), title, subTitle: null, cover }
    }

    search = {
        load: async (keyword, options, page) => {
            let url = page > 1
                ? `${this.base}/page/${page}/?s=${encodeURIComponent(keyword)}&post_type=wp-manga`
                : `${this.base}/?s=${encodeURIComponent(keyword)}&post_type=wp-manga`

            let res = await Network.get(url, this.pageHeaders())
            if (res.status !== 200) throw `Invalid status code: ${res.status}`

            let doc = new HtmlDocument(res.body)
            let comics = []
            doc.querySelectorAll(".c-tabs-item__content, .page-item-detail").forEach(el => {
                let item = this.parseSearchItem(el)
                if (item) comics.push(item)
            })
            let maxPage = 1
            doc.querySelectorAll(".page-numbers, .wp-pagenavi a").forEach(a => {
                let n = parseInt(a.text.trim())
                if (!isNaN(n) && n > maxPage) maxPage = n
            })
            doc.dispose()

            // 兜底：HTML 选择器没匹配到 → 退回自动补全接口（此时无封面）
            if (!comics.length) {
                let res2 = await Network.post(
                    this.ajaxUrl,
                    this.ajaxHeaders(),
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

    // ============ 详情：标题封面解析 + AJAX 拿章节 ============
    async extractMangaId(pageHtml, respHeaders) {
        // ① 短链接头：Link: <https://mangaforfree.net/?p=26784>; rel=shortlink
        let link = respHeaders?.["link"] || respHeaders?.["Link"] || ""
        let m = link.match(/[?&]p=(\d+)/)
        if (m) return m[1]
        // ② HTML 里的 shortlink
        m = pageHtml.match(/rel=["']shortlink["'][^>]*href=["'][^"']*[?&]p=(\d+)/)
        if (m) return m[1]
        // ③ 任意 p= 数字
        m = pageHtml.match(/[?&]p=(\d{4,7})/)
        if (m) return m[1]
        throw "无法从详情页提取 manga id"
    }

    async getChaptersByMangaId(mangaId) {
        let res = await Network.post(
            this.ajaxUrl,
            this.ajaxHeaders(),
            `action=manga_get_chapters&manga=${mangaId}`
        )
        if (res.status !== 200) throw `Invalid status code: ${res.status}`

        let doc = new HtmlDocument(res.body)
        let chapters = new Map()
        let seen = new Set()
        // 这个 AJAX 返回的 HTML 才是我们最开始验证过的结构
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
            let cover = coverEl?.attributes["data-src"]
                || coverEl?.attributes["data-lazy-src"]
                || coverEl?.attributes["src"]
                || ""
            let desc = doc.querySelector(".summary__content")?.text?.trim()
                || doc.querySelector(".manga-excerpt")?.text?.trim()
                || ""
            let authors = doc.querySelectorAll(".author-content a").map(a => a.text.trim())
            let tags = doc.querySelectorAll(".genres-content a").map(a => a.text.trim())
            let status = doc.querySelector(".post-status .summary-content")?.text?.trim()
            doc.dispose()

            // 关键：用数字 id 调 AJAX 拿章节（原始 HTML 里没有章节！）
            let mangaId = await this.extractMangaId(res.body, res.headers)
            let chapters = await this.getChaptersByMangaId(mangaId)
            if (!chapters.size) throw "未解析到章节列表"

            return new ComicDetails({
                id,
                title,
                cover,
                description: desc,
                tags: {
                    "作者": authors,
                    "状态": status ? [status] : [],
                    "标签": tags,
                },
                chapters,
            })
        },

        loadEp: async (comicId, epId) => {
            let res = await Network.get(`${this.base}/manga/${comicId}/${epId}/`, this.pageHeaders())
            if (res.status !== 200) throw `Invalid status code: ${res.status}`

            let doc = new HtmlDocument(res.body)
            let images = []
            doc.querySelectorAll(".reading-content img").forEach(img => {
                let src = img.attributes["data-src"]
                    || img.attributes["data-lazy-src"]
                    || img.attributes["src"]
                if (src) images.push(src)
            })
            doc.dispose()
            if (!images.length) throw "未解析到图片"
            return { images }
        },
    }

    category = { title: "分类", parts: [] }
    categoryComics = {
        load: async (category, param, options, page) => ({ comics: [], maxPage: 1 })
    }
    settings = {}
}
