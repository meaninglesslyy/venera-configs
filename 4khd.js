class FourKHD extends ComicSource {
    name = "4KHD"
    key = "4khd"
    version = "1.0.0"
    minAppVersion = "1.6.0"
    url = ""
    search = {
        load: function(k, o, p) {
            var url = "https://www.4khd.com/search/" + encodeURIComponent(k) + "/"
            return Network.get(url, {}).then(function(r) {
                if (r.status !== 200) throw "err"
                var d = new HtmlDocument(r.body)
                var c = []
                var items = d.querySelectorAll("li.wp-block-post")
                for (var i = 0; i < items.length; i++) {
                    var el = items[i]
                    var img = el.querySelector(".wp-block-post-featured-image img")
                    var cover = img ? (img.attributes["src"] || "") : ""
                    var a = el.querySelector(".wp-block-post-title a")
                    if (!a) continue
                    var href = a.attributes["href"]
                    var t = (a.text || "").trim()
                    if (href && t) {
                        c.push({id: href.replace(/\/+$/, "").split("/").pop().replace(".html", ""), title: t, cover: cover})
                    }
                }
                d.dispose()
                return {comics: c, maxPage: 1}
            }).catch(function() {return {comics: [], maxPage: 1}})
        },
        optionList: []
    }
    category = {title: "", parts: []}
    categoryComics = {load: function() {return Network.get("https://www.4khd.com/", {}).then(function() {return {comics: [], maxPage: 1}})}}
    comic = {
        loadInfo: function(id) {
            return Network.get("https://www.4khd.com/content/" + id + ".html", {}).then(function(r) {
                var d = new HtmlDocument(r.body)
                var t = d.querySelector(".wp-block-post-title")
                var tt = t ? (t.text || "").trim() : id
                var cover = ""
                var m = r.body.match(/<meta property="og:image" content="([^"]+)"/)
                if (m) cover = m[1]
                var ch = new Map()
                ch.set("0", "View")
                d.dispose()
                return new ComicDetails({id: id, title: tt, cover: cover, chapters: ch})
            })
        },
        loadEp: function(id, e) {
            return Network.get("https://www.4khd.com/content/" + id + ".html", {}).then(function(r) {
                var d = new HtmlDocument(r.body)
                var imgs = []
                var images = d.querySelectorAll("img[src*='pic.4khd']")
                for (var i = 0; i < images.length; i++) {
                    var s = images[i].attributes["src"]
                    if (s) imgs.push(s)
                }
                d.dispose()
                if (!imgs.length) throw "no images"
                return {images: imgs}
            })
        }
    }
    settings = {}
}
