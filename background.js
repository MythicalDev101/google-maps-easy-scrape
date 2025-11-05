// Background service worker: listens for the "scrape" command and runs the scraping
// function in the active tab, then merges results into chrome.storage.local

chrome.commands.onCommand.addListener(function(command) {
    if (command !== 'scrape') return;

    chrome.tabs.query({ active: true, currentWindow: true }, function(tabs) {
        var tab = tabs && tabs[0];
        if (!tab) return;

        chrome.scripting.executeScript({
            target: { tabId: tab.id },
            function: scrapeData
        }, function(results) {
            if (!results || !results[0] || !results[0].result) return;
            var newItems = results[0].result;

            chrome.storage.local.get(['gmes_results'], function(data) {
                var existing = Array.isArray(data.gmes_results) ? data.gmes_results : [];
                var seen = new Set(existing.map(function(it) { return it.href || (it.title + '|' + it.address); }));
                var added = false;

                newItems.forEach(function(item) {
                    var key = item.href || (item.title + '|' + item.address);
                    if (!key) return;
                    if (seen.has(key)) return;
                    seen.add(key);
                    existing.push(item);
                    added = true;
                });

                if (added) {
                    chrome.storage.local.set({ gmes_results: existing });
                }
            });
        });
    });
});

// The scrapeData function is serialized and injected into the page by executeScript.
// It must not reference extension APIs; it only inspects the DOM and returns data.
function scrapeData() {
    var links = Array.from(document.querySelectorAll('a[href^="https://www.google.com/maps/place"]'));
    return links.map(link => {
        var container = link.closest('[jsaction*="mouseover:pane"]');
        var titleText = container ? container.querySelector('.fontHeadlineSmall').textContent : '';
        var rating = '';
        var reviewCount = '';
        var phone = '';
        var industry = '';
        var address = '';
        var companyUrl = '';

        // Rating and Reviews
        if (container) {
            var roleImgContainer = container.querySelector('[role="img"]');
            
            if (roleImgContainer) {
                var ariaLabel = roleImgContainer.getAttribute('aria-label');
            
                if (ariaLabel && ariaLabel.includes("stars")) {
                    var parts = ariaLabel.split(' ');
                    var rating = parts[0];
                    var reviewCount = '(' + parts[2] + ')'; 
                } else {
                    rating = '0';
                    reviewCount = '0';
                }
            }
        }

        // Address and Industry
        if (container) {
            var containerText = container.textContent || '';
            var addressRegex = /\d+ [\w\s]+(?:#\s*\d+|Suite\s*\d+|Apt\s*\d+)?/;
            var addressMatch = containerText.match(addressRegex);

            if (addressMatch) {
                address = addressMatch[0];

                // Extract industry text based on the position before the address
                var textBeforeAddress = containerText.substring(0, containerText.indexOf(address)).trim();
                var ratingIndex = textBeforeAddress.lastIndexOf(rating + reviewCount);
                if (ratingIndex !== -1) {
                    // Assuming industry is the first significant text after rating and review count
                    var rawIndustryText = textBeforeAddress.substring(ratingIndex + (rating + reviewCount).length).trim().split(/[\r\n]+/)[0];
                    var cleanedRawIndustry = rawIndustryText.replace(/[·.,#!?]/g, '').trim();
                    var industryAlpha = cleanedRawIndustry.replace(/[^A-Za-z\s]/g, '').trim();
                    // keep only digits, $, hyphen, en-dash and plus
                    var expensivenessVal = cleanedRawIndustry.replace(/[^0-9$\-\u2013+]/g, '').trim();
                    industry = industryAlpha;
                    var expensiveness = expensivenessVal;
                }
                var filterRegex = /\b(Closed|Open 24 hours|24 hours)|Open\b/g;
                address = address.replace(filterRegex, '').trim();
                address = address.replace(/(\d+)(Open)/g, '$1').trim();
                address = address.replace(/(\w)(Open)/g, '$1').trim();
                address = address.replace(/(\w)(Closed)/g, '$1').trim();
            } else {
                address = '';
            }
        }

        // Company URL
        if (container) {
            var allLinks = Array.from(container.querySelectorAll('a[href]'));
            var filteredLinks = allLinks.filter(a => !a.href.startsWith("https://www.google.com/maps/place/"));
            if (filteredLinks.length > 0) {
                companyUrl = filteredLinks[0].href;
            }
        }

        // Phone Numbers
        if (container) {
            var containerText = container.textContent || '';
            var phoneRegex = /(\+\d{1,2}\s)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
            var phoneMatch = containerText.match(phoneRegex);
            phone = phoneMatch ? phoneMatch[0] : '';
        }

        // small helper to extract city from address inside the injected function
        function getCityFromAddress_local(addr) {
            if (!addr || typeof addr !== 'string') return '';
            var parts = addr.split(',').map(function(p){return p.trim();}).filter(Boolean);
            if (parts.length === 0) return '';
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                if (!/^\d+$/.test(p) && !/^[A-Z0-9\- ]{2,}$/.test(p)) {
                    return p;
                }
            }
            return parts[parts.length - 1];
        }

        // Try to extract city from the Maps search box (e.g. "Restaurants in City")
        var searchCity = '';
        try {
            var searchInput = document.querySelector('#searchboxinput') || document.querySelector('input[aria-label*="Search"]');
            var searchVal = searchInput ? (searchInput.value || '') : '';
            var m = searchVal.match(/(?:Restaurants?|Restaurant) in (.+)/i);
            if (m && m[1]) searchCity = m[1].trim();
        } catch (e) {
            // ignore
        }

        var city = searchCity || getCityFromAddress_local(address);
        var query = titleText + (city ? ' ' + city : '') + ' Instagram';
        var instaSearch = 'https://www.google.com/search?q=' + encodeURIComponent(query);

        return {
            title: titleText,
            rating: rating,
            reviewCount: reviewCount,
            phone: phone,
            industry: industry,
            expensiveness: (typeof expensiveness !== 'undefined') ? expensiveness : '',
            city: city,
            address: address,
            companyUrl: companyUrl,
            instaSearch: instaSearch,
            href: link.href,
        };
    });
}
