
// com.theverge.unf_cked

// version 1: initial release


function load() {	
	let extraHeaders = [];	
	let lastModified = getItem("lastModified");
	if (lastModified != null) {
		console.log(`lastModified = ${lastModified}`);
		extraHeaders["if-modified-since"] = lastModified;
	}
	extraHeaders["accept-encoding"] = "gzip,deflate";

	//extraHeaders = null; // TESTING ONLY
	
	sendRequest(site, "GET", null, extraHeaders, true)
	.then((text) => {
		const response = JSON.parse(text);
		console.log(`response.status = ${response.status}`);

		if (response.status != 200) {
			// 304, 500 and other non-200 responses return no results 
			processResults([]);
			return;
		}
		
		// extract headers per: https://fishbowl.pastiche.org/2002/10/21/http_conditional_get_for_rss_hackers
		const headers = response.headers;
		if (headers["last-modified"] != null) {
			console.log(`headers["last-modified"] = ${headers["last-modified"]}`);
			setItem("lastModified", headers["last-modified"]);
		}
		if (headers["etag"] != null) {
			console.log(`headers["etag"] = ${headers["etag"]}`);
			let eTag = headers["etag"];
			if (eTag.startsWith("W/")) {
				// the weak comparison algorithm is not used for if-none-match and including it breaks some servers
				// https://developer.mozilla.org/en-US/docs/Web/HTTP/Headers/If-None-Match
				eTag = eTag.substring(2);
			}
			if (eTag.endsWith("-gzip\"")) {
				// similarly, Apache can do weird things with the AddSuffix DeflateAlterETag directive:
				// https://httpd.apache.org/docs/trunk/mod/mod_deflate.html
				eTag = eTag.slice(0, -6) + "\"";
			}
			setItem("eTag", eTag);
		}
		
		let jsonObject = xmlParse(response.body);
				
		if (jsonObject.feed != null) {
			// Atom 1.0
			const feedAttributes = jsonObject.feed.link$attrs;
			let feedUrl = null;
			if (feedAttributes instanceof Array) {
				for (const feedAttribute of feedAttributes) {
					if (feedAttribute?.rel == "alternate") {
						feedUrl = feedAttribute.href;
						break;
					}
				}
			}
			else if (feedAttributes?.rel == "alternate") {
				feedUrl = feedAttributes.href;
			} else if (
				jsonObject.feed.id.startsWith("http://") ||
				jsonObject.feed.id.startsWith("https://")
			) {
				feedUrl = jsonObject.feed.id
			}
			const feedName = jsonObject.feed.title;
		
			let entries = [];
			if (jsonObject.feed.entry != null) {
				const entry = jsonObject.feed.entry;
				if (entry instanceof Array) {
					entries = entry;
				}
				else {
					entries = [entry];
				}
			}
			var results = [];
			for (const entry of entries) {
				const entryAttributes = entry.link$attrs;
				let entryUrl = null;
				if (entryAttributes instanceof Array) {
					for (const entryAttribute of entryAttributes) {
						if (entryAttribute.rel == "alternate") {
							entryUrl = entryAttribute.href;
							break;
						}
					}
					// Posts need to have a link and if we didn't find one
					// with rel == "alternate" then we'll use the first link.
					if (!entryUrl && entryAttributes.length > 0) {
						entryUrl = entryAttributes[0].href;
					}
				}
				else {
					if (entryAttributes.rel == "alternate" || entryAttributes.rel == null) {
						entryUrl = entryAttributes.href;
					}
				}

				let url = entryUrl;
				if (true) { // NOTE: If this causes problems, we can put it behind a setting.
					const urlClean = url.split("?").splice(0,1).join();
					const urlParameters = url.split("?").splice(1).join("?");
					if (urlParameters.includes("utm_id") || urlParameters.includes("utm_source") || urlParameters.includes("utm_medium") || urlParameters.includes("utm_campaign")) {
						console.log(`removed parameters: ${urlParameters}`);
						url = urlClean;
					}
				}

				let date = null;
				if (entry.published) {
					date = new Date(entry.published);
				}
				else if (entry.updated) {
					date = new Date(entry.updated);
				}
				else {
					date = new Date();
				}
				const title = extractString(entry.title);
				
				let content = ""
				if (entry.content$attrs != null && entry.content$attrs["type"] == "xhtml") {
					content = entry.content$xhtml;
				}
				else {
					content = extractString((entry.content ?? entry.summary), true);
				}
				
				var identity = null;
				if (entry.author != null) {
					let authorName = entry.author.name;
					if (authorName != null) {
						if (authorName instanceof Array) {
							authorName = authorName.join(", ");
						}
						else {
							authorName = authorName.trim();
						}
						identity = Identity.createWithName(authorName);
						if (entry.author.uri != null) {
							identity.uri = entry.author.uri;
						}
					}
				}
				
				const resultItem = Item.createWithUriDate(url, date);
				if (title != null) {
					resultItem.title = title;
				}
				if (content != null) {
					resultItem.body = content;
				}
				if (identity != null) {
					resultItem.author = identity;
				}
				if (entryAttributes instanceof Array) {
					const attachments = entryAttributes
					.filter(e => {
						if (e.type) {
							// Check for a MIME type that suggests this is an image, e.g. image/jpeg.
							return e.type.startsWith("image/");
						} else {
							return false;
						}
					})
					.map(link => {
						const attachment = MediaAttachment.createWithUrl(link.href);
						attachment.text = link.title || link.text;
						attachment.mimeType = "image";
						return attachment;
					})
					if (attachments.length > 0) {
						resultItem.attachments = attachments;
					}
				}
				else {
					// extract any media from RSS: https://www.rssboard.org/media-rss
					if (entry["media:group"] != null) {
						const mediaGroup = entry["media:group"];

						const mediaAttributes = mediaGroup["media:thumbnail$attrs"];
						let attachment = attachmentForAttributes(mediaAttributes);
						if (attachment != null) {
							resultItem.attachments = [attachment];
						}
					}
					else if (entry["media:thumbnail$attrs"] != null) {
						const mediaAttributes = entry["media:thumbnail$attrs"];
						let attachment = attachmentForAttributes(mediaAttributes);
						if (attachment != null) {
							resultItem.attachments = [attachment];
						}
					}
					else if (entry["media:content$attrs"] != null) {
						const mediaAttributes = entry["media:content$attrs"];
						let attachment = attachmentForAttributes(mediaAttributes);
						if (attachment != null) {
							resultItem.attachments = [attachment];
						}
					}
				}

				results.push(resultItem);
			}

			processResults(results);
		}
	})
	.catch((requestError) => {
		processError(requestError);
	});	
}

function extractString(node, allowHTML = false) {
	// people love to put HTML in title & descriptions, where it's not allowed - this is an
	// imperfect attempt to undo that damage
	if (node != null) {
		if (typeof(node) == "string") {
			let updated = node.trim();
			updated = updated.replaceAll("&Acirc;&nbsp;", "&nbsp;");
			updated = updated.replaceAll("&acirc;&#128;&#147;", "&ndash;");
			updated = updated.replaceAll("&acirc;&#128;&#148;", "&mdash;");
			updated = updated.replaceAll("&acirc;&#128;&#152;", "&lsquo;");
			updated = updated.replaceAll("&acirc;&#128;&#153;", "&rsquo;");
			updated = updated.replaceAll("&acirc;&#128;&#156;", "&ldquo;");
			updated = updated.replaceAll("&acirc;&#128;&#157;", "&rdquo;");
			updated = updated.replaceAll("&amp;hellip;", "&hellip;");
			return updated;
		}
		else if (typeof(node) == "object") {
			// do a traversal of the node graph to generate a string representation of <p> and <a> elements
			if (node["p"] != null) {
				if (node["p"] instanceof Array) {
					let value = "";
					for (const childNode of node["p"]) {
						const string = extractString(childNode, allowHTML);
						if (allowHTML) {
							value += `<p>${string}</p>\n`;
						}
						else {
							value += string;
						}
					}
					return value;
				}
				else {
					const string = extractString(node["p"], allowHTML);
					if (allowHTML) {
						return `<p>${string}</p>\n`;
					}
					else {
						return string;
					}
				}
			}
			else if (node["a"] != null) {
				if (node["a"] instanceof Array) {
					let value = "";
					for (const childNode of node["a"]) {
						const string = extractString(childNode, allowHTML);
						if (allowHTML && node["a$attrs"]?.href != null) {
							value += `<a href="${node["a$attrs"]?.href}">${string}</a>`;
						}
						else {
							value += string;
						}
					}
					return value;
				}
				else {
					const string = extractString(node["a"], allowHTML);
					if (allowHTML && node["a$attrs"]?.href != null) {
						return `<a href="${node["a$attrs"]?.href}">${string}</a>`;
					}
					else {
						return string;
					}
				}
			}
		}
		else {
			console.log(node);
		}
	}
	
	return null;
}
