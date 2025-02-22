
// de.fefe.blog

// blog code:
// https://gist.githubusercontent.com/tazjin/f8a4b0235fb37bb1f3de59f57f7fd638/raw/a737d13e6ac86bcdea40848f7d70dbdfd3cd411c/fefes-blog.c
// 
// but ZAHL is not.
//
// but last-modified headers are:
// https://mastodon.social/@forst/114044496753596709

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
		
		const headers = response.headers;
		if (headers["last-modified"] != null) {
			console.log(`headers["last-modified"] = ${headers["last-modified"]}`);
			setItem("lastModified", headers["last-modified"]);
		}
		
		let jsonObject = xmlParse(response.body);
				
		if (jsonObject.rss != null && jsonObject.rss.channel != null) {
			// RSS 2.0
			const feedUrl = jsonObject.rss.channel.link;
			const feedName = jsonObject.rss.channel.title;

			let items = [];
			if (jsonObject.rss.channel.item != null) {
				const item = jsonObject.rss.channel.item;
				if (item instanceof Array) {
					items = item;
				}
				else {
					items = [item];
				}
			}

			let results = [];
			for (const item of items) {
				let guid = item["guid"]; // "https://blog.fefe.de/?ts=99462794"
				let link = item["link"]; // "https://blog.fefe.de/?ts=99462794"
				let title = item["title"]; // "Ich spreche kein Deutsch"
								
				let hexTimestamp = guid.split("=")[1];
				let ts = parseInt(hexTimestamp, 16);
				let ZAHL = parseInt("0xfefec0de", 16); // OMG
				
				let timestamp = ts ^ ZAHL;
				const date = new Date(timestamp * 1000);

				const resultItem = Item.createWithUriDate(link, date);
				if (title != null) {
					resultItem.body = title;
				}
				
				results.push(resultItem);
			}

			processResults(results);
		}
		else {
			// Unknown
			processResults([]);
		}
	})
	.catch((requestError) => {
		processError(requestError);
	});	
}
