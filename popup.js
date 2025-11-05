document.addEventListener('DOMContentLoaded', function() {
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
        var currentTab = tabs[0];
        var actionButton = document.getElementById('actionButton');
        var clearButton = document.getElementById('clearListButton');
        var downloadCsvButton = document.getElementById('downloadCsvButton');
        var resultsTable = document.getElementById('resultsTable');

        // Defensive checks: ensure the table and its parts exist. If not, create them
        if (!resultsTable) {
            console.error('Results table element `#resultsTable` not found in popup DOM.');
            return; // nothing to render into
        }

        var resultsTbody = resultsTable.querySelector('tbody');
        if (!resultsTbody) {
            resultsTbody = document.createElement('tbody');
            resultsTable.appendChild(resultsTbody);
        }

        var filenameInput = document.getElementById('filenameInput');
        var resultsTheadRow = resultsTable.querySelector('thead tr');
        if (!resultsTheadRow) {
            var thead = resultsTable.querySelector('thead') || document.createElement('thead');
            if (!resultsTable.querySelector('thead')) resultsTable.insertBefore(thead, resultsTbody);
            resultsTheadRow = thead.querySelector('tr') || document.createElement('tr');
            if (!thead.querySelector('tr')) thead.appendChild(resultsTheadRow);
        }
        // Keep track of seen entries to avoid duplicates across scrapes
        var seenEntries = new Set();
        // Stored items persisted to localStorage so the popup can be reopened
        // without losing the list
        var storedItems = [];

        // Helper: try to extract a city name from an address string
        function getCityFromAddress(address) {
            if (!address || typeof address !== 'string') return '';
            var parts = address.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
            if (parts.length === 0) return '';
            // prefer the last non-numeric segment (often city or state)
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                // skip segments that look like postal codes or all-caps region codes
                if (!/^\d+$/.test(p) && !/^[A-Z0-9\- ]{2,}$/.test(p)) {
                    return p;
                }
            }
            // fallback to last segment
            return parts[parts.length - 1];
        }

        // Clean expensiveness: keep only digits, dollar sign, hyphen, en-dash, plus
        function cleanExpensiveness(raw) {
            if (!raw) return '';
            try {
                return String(raw).replace(/[^0-9$\-\u2013+]/g, '').trim();
            } catch (e) {
                return '';
            }
        }

        // Helper: create a table row element from an item object
        function createRowFromItem(item) {
            var row = document.createElement('tr');
                // column order: title, closedStatus, rating, reviewCount, phone, industry, expensiveness, city, address, website, instaSearch, maps link
                ['title', 'closedStatus', 'rating', 'reviewCount', 'phone', 'industry', 'expensiveness', 'city', 'address', 'companyUrl', 'instaSearch', 'href'].forEach(function(colKey) {
                var cell = document.createElement('td');

                // Special rendering for links
                if (colKey === 'companyUrl' || colKey === 'href') {
                    var url = item[colKey] || '';
                    if (colKey === 'companyUrl') {
                        // If companyUrl is empty OR it's a Google Maps link, create a search link for the website
                        var isMapsLink = url && url.indexOf('https://www.google.com/maps') === 0;
                        if (!url || isMapsLink) {
                            // build search query: Title + City + Website
                            var qParts = [];
                            if (item.title) qParts.push(item.title);
                            if (item.city) qParts.push(item.city);
                            qParts.push('Website');
                            var query = qParts.join(' ');
                            var searchUrl = 'https://www.google.com/search?q=' + encodeURIComponent(query);
                            var a = document.createElement('a');
                            a.href = searchUrl;
                            a.textContent = 'Search For Website';
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                            cell.appendChild(a);
                        } else {
                            var a = document.createElement('a');
                            a.href = url;
                            a.textContent = 'Goto Website';
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                            cell.appendChild(a);
                        }
                    } else {
                        // href (maps link) column
                        var mapsUrl = url || '';
                        if (mapsUrl) {
                            var a = document.createElement('a');
                            a.href = mapsUrl;
                            a.textContent = 'Open In Google maps';
                            a.target = '_blank';
                            a.rel = 'noopener noreferrer';
                            cell.appendChild(a);
                        }
                    }
                } else if (colKey === 'instaSearch') {
                    var url = item[colKey] || '';
                    if (url) {
                        var a = document.createElement('a');
                        a.href = url;
                        try {
                            // try to display the search query (decoded)
                            var q = '';
                            var parts = url.split('?');
                            if (parts.length > 1) {
                                var params = parts[1].split('&');
                                for (var pi = 0; pi < params.length; pi++) {
                                    var kv = params[pi].split('=');
                                    if (kv[0] === 'q') { q = decodeURIComponent(kv[1].replace(/\+/g, ' ')); break; }
                                }
                            }
                            a.textContent = q || url;
                        } catch (e) {
                            a.textContent = url;
                        }
                        a.target = '_blank';
                        a.rel = 'noopener noreferrer';
                        cell.appendChild(a);
                    }
                } else {
                    var text = item[colKey] || '';
                    if (colKey === 'reviewCount' && text) {
                        text = text.replace(/\(|\)/g, '');
                    }
                    cell.textContent = text;
                }

                row.appendChild(cell);
            });
            return row;
        }

        // Render all items (clear and re-render) from an array
        function renderAllFromStoredItems(items) {
            storedItems = Array.isArray(items) ? items : [];
            // clear tbody
            while (resultsTbody.firstChild) {
                resultsTbody.removeChild(resultsTbody.firstChild);
            }
            seenEntries.clear();

            storedItems.forEach(function(item) {
                var uniqueKey = item.href || (item.title + '|' + item.address);
                if (!uniqueKey) return;
                    // normalize expensiveness for older stored items
                    item.expensiveness = cleanExpensiveness(item.expensiveness || '');
                    if (seenEntries.has(uniqueKey)) return;
                    seenEntries.add(uniqueKey);
                var row = createRowFromItem(item);
                resultsTbody.appendChild(row);
            });

            // enable/disable buttons based on presence of items
            if (storedItems.length > 0) {
                downloadCsvButton.disabled = false;
                if (clearButton) clearButton.disabled = false;
            } else {
                downloadCsvButton.disabled = true;
                if (clearButton) clearButton.disabled = true;
            }
                // Update the message to show total extracted when on Maps page
                try {
                    if (currentTab && currentTab.url.includes('://www.google.com/maps/')) {
                        var msgEl = document.getElementById('message');
                        if (msgEl) msgEl.textContent = 'Total Extracted: ' + (storedItems.length || 0);
                    }
                } catch (e) {
                    console.error('Failed to update total extracted message', e);
                }
        }

        // Load persisted items from chrome.storage.local and render them
        function loadFromStorage() {
            try {
                chrome.storage.local.get(['gmes_results'], function(data) {
                    renderAllFromStoredItems(Array.isArray(data.gmes_results) ? data.gmes_results : []);
                });
            } catch (e) {
                console.error('Failed to load stored results', e);
            }
        }

        // Save current storedItems array to chrome.storage.local
        function saveToStorage() {
            try {
                chrome.storage.local.set({ gmes_results: storedItems });
            } catch (e) {
                console.error('Failed to save results', e);
            }
        }

        // Listen for storage changes (e.g., background command added items)
        chrome.storage.onChanged.addListener(function(changes, area) {
            if (area !== 'local') return;
            if (changes.gmes_results) {
                renderAllFromStoredItems(Array.isArray(changes.gmes_results.newValue) ? changes.gmes_results.newValue : []);
            }
        });

        if (currentTab && currentTab.url.includes("://www.google.com/maps/")) {
            document.getElementById('message').textContent = 'Total Extracted: 0';
            actionButton.disabled = false;
            actionButton.classList.add('enabled');
        } else {
            var messageElement = document.getElementById('message');
            messageElement.innerHTML = '';
            var linkElement = document.createElement('a');
            linkElement.href = 'https://www.google.com/maps/search/';
            linkElement.textContent = "Go to Google Maps Search.";
            linkElement.target = '_blank'; 
            messageElement.appendChild(linkElement);

            actionButton.style.display = 'none'; 
            downloadCsvButton.style.display = 'none';
            filenameInput.style.display = 'none'; 
        }

        // Render table header once (so it isn't re-rendered/cleared on each scrape)
        (function renderHeader() {
            const headers = ['Title', 'Closed Status', 'Rating', 'Reviews', 'Phone', 'Industry', 'Expensiveness', 'City', 'Address', 'Website', 'Insta Search', 'Google Maps Link'];
            // clear existing header row contents
            resultsTheadRow.innerHTML = '';
            headers.forEach(function(headerText) {
                var header = document.createElement('th');
                header.textContent = headerText;
                resultsTheadRow.appendChild(header);
            });
        })();

        // Initially disable Clear List button (no items yet)
        if (clearButton) clearButton.disabled = true;

        // Load persisted items (if any) and enable buttons accordingly
        loadFromStorage();

        actionButton.addEventListener('click', function() {
            chrome.scripting.executeScript({
                target: {tabId: currentTab.id},
                function: scrapeData
            }, function(results) {
                if (!results || !results[0] || !results[0].result) return;

                // Append only unique items (by href when available)
                // filter out any falsy results (e.g., permanently closed places that we skipped)
                (results[0].result || []).filter(Boolean).forEach(function(item) {
                    var uniqueKey = item.href || (item.title + '|' + item.address);
                    if (!uniqueKey) return;
                    // sanitize expensiveness before saving/display
                    item.expensiveness = cleanExpensiveness(item.expensiveness || '');
                    if (seenEntries.has(uniqueKey)) return; // skip duplicates
                    seenEntries.add(uniqueKey);

                    // Append to DOM
                    var row = createRowFromItem(item);
                    resultsTbody.appendChild(row);

                    // Persist the new item
                    storedItems.push(item);
                    saveToStorage();
                });

                // enable download and clear buttons if we have at least one entry
                if (seenEntries.size > 0) {
                    downloadCsvButton.disabled = false;
                    if (clearButton) clearButton.disabled = false;
                }
            });
        });

        // Clear List button clears the tbody and the seen set
        if (clearButton) {
            clearButton.addEventListener('click', function() {
                var confirmed = confirm('Are you sure you want to clear the list? This will remove all saved entries.');
                if (!confirmed) return;

                while (resultsTbody.firstChild) {
                    resultsTbody.removeChild(resultsTbody.firstChild);
                }
                seenEntries.clear();
                storedItems = [];
                saveToStorage();
                downloadCsvButton.disabled = true;
                clearButton.disabled = true;
            });
        }

        // Export visible table preview to an HTML-based .xls file which preserves hyperlinks
        // (works with Excel and many spreadsheet apps and avoids loading remote libs subject to CSP)
        downloadCsvButton.addEventListener('click', function() {
            try {
                var filename = filenameInput.value.trim();
                if (!filename) {
                    filename = 'google-maps-data.xls';
                } else {
                    filename = filename.replace(/[^a-z0-9]/gi, '_').toLowerCase() + '.xls';
                }

                // Build HTML table using the visible cell HTML to preserve anchors and labels
                var headers = Array.from(resultsTable.querySelectorAll('thead th'));
                var rows = Array.from(resultsTable.querySelectorAll('tbody tr'));

                var html = '<!DOCTYPE html><html><head><meta charset="utf-8"></head><body>';
                html += '<table border="1" style="border-collapse:collapse;">';
                // headers
                html += '<thead><tr>';
                headers.forEach(function(h) { html += '<th>' + (h.innerText || '') + '</th>'; });
                html += '</tr></thead>';
                // body
                html += '<tbody>';
                rows.forEach(function(tr) {
                    html += '<tr>';
                    var cols = Array.from(tr.querySelectorAll('td'));
                    cols.forEach(function(td) {
                        // Use innerHTML so anchor tags are preserved
                        var cellHtml = td.innerHTML || '';
                        html += '<td>' + cellHtml + '</td>';
                    });
                    html += '</tr>';
                });
                html += '</tbody></table></body></html>';

                var blob = new Blob([html], { type: 'application/vnd.ms-excel' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                setTimeout(function() { URL.revokeObjectURL(url); a.remove(); }, 1000);
            } catch (e) {
                console.error('Failed to export XLS', e);
                alert('Export failed: ' + (e && e.message ? e.message : e));
            }
        });

    });
});


function scrapeData() {
    var links = Array.from(document.querySelectorAll('a[href^="https://www.google.com/maps/place"]'));
    return links.map(link => {
        var container = link.closest('[jsaction*="mouseover:pane"]');
        var titleText = container ? container.querySelector('.fontHeadlineSmall').textContent : '';
        // gather a plain-text version of the container for status detection
        var containerText = container ? (container.textContent || '') : '';
        // Detect closed status: if permanently closed, skip (return null). If temporarily closed, mark it.
        var closedStatus = '';
        if (/permanently closed/i.test(containerText)) {
            // skip permanently closed places entirely
            return null;
        } else if (/temporaril(?:y)? closed/i.test(containerText) || /temporarily closed/i.test(containerText)) {
            closedStatus = 'Temporarily Closed';
        }
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
                        // Industry: keep only alphabetical characters and spaces
                        var industryAlpha = cleanedRawIndustry.replace(/[^A-Za-z\s]/g, '').trim();
                        // Expensiveness: everything other than alphabetical characters (symbols, $, digits, etc.)
                        var expensivenessVal = cleanedRawIndustry.replace(/[A-Za-z\s]/g, '').trim();
                        industry = industryAlpha;
                        // expose expensiveness in a variable for return
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

        // Helper inside injected function: extract city from address
        function getCityFromAddress_local(addr) {
            if (!addr || typeof addr !== 'string') return '';
            var parts = addr.split(',').map(function(p){ return p.trim(); }).filter(Boolean);
            if (parts.length === 0) return '';
            for (var i = parts.length - 1; i >= 0; i--) {
                var p = parts[i];
                if (!/^\d+$/.test(p) && !/^[A-Z0-9\- ]{2,}$/.test(p)) {
                    return p;
                }
            }
            return parts[parts.length - 1];
        }

        // Try to get the current Maps search (e.g. "Restaurants in City") and extract city
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

        // Return the data as an object (include closedStatus)
        return {
            title: titleText,
            closedStatus: closedStatus,
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

// Convert the table to a CSV string
function tableToCsv(table) {
    var csv = [];
    var rows = table.querySelectorAll('tr');
    
    for (var i = 0; i < rows.length; i++) {
        var row = [], cols = rows[i].querySelectorAll('td, th');

        for (var j = 0; j < cols.length; j++) {
            // Export the visible text exactly as shown in the popup (including link labels)
            var text = cols[j].innerText || '';
            // Escape double quotes inside cell text
            text = text.replace(/"/g, '""');
            row.push('"' + text + '"');
        }
        csv.push(row.join(','));
    }
    return csv.join('\n');
}

// Download the CSV file
function downloadCsv(csv, filename) {
    var csvFile;
    var downloadLink;

    csvFile = new Blob([csv], {type: 'text/csv'});
    downloadLink = document.createElement('a');
    downloadLink.download = filename;
    downloadLink.href = window.URL.createObjectURL(csvFile);
    downloadLink.style.display = 'none';
    document.body.appendChild(downloadLink);
    downloadLink.click();
}