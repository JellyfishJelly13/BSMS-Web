(function () {
    const PAGE_VERSION = window.BSMS_WEB_PAGE_VERSION;
    const PAGE_NAME = window.BSMS_WEB_PAGE_NAME;

    if (!PAGE_VERSION || !PAGE_NAME) {
        console.error("BSMS Web version checker: PAGE_VERSION or PAGE_NAME is missing.");
        return;
    }

    const FIREBASE_URL =
        `https://bsms-web-default-rtdb.firebaseio.com/config/versions/${encodeURIComponent(PAGE_NAME)}.json`;

    function isNewer(a, b) {
        a = a.split(".").map(Number);
        b = b.split(".").map(Number);

        for (let i = 0; i < Math.max(a.length, b.length); i++) {
            if ((a[i] || 0) > (b[i] || 0)) return true;
            if ((a[i] || 0) < (b[i] || 0)) return false;
        }

        return false;
    }

    async function checkForUpdate() {
        try {
            const r = await fetch(FIREBASE_URL, {
                cache: "no-store"
            });

            const latest = (await r.text())
                .replace(/"/g, "")
                .trim();

            if (
                !isNewer(latest, PAGE_VERSION) ||
                document.getElementById("versionUpdatePopup")
            ) {
                return;
            }

            const s = document.createElement("style");

            s.textContent = `
                #versionUpdatePopup{
                    position:fixed!important;
                    inset:0!important;
                    z-index:2147483647!important;
                    display:flex!important;
                    align-items:center!important;
                    justify-content:center!important;
                    padding:20px!important;
                    background:rgba(0,0,0,.85)!important;
                    backdrop-filter:blur(4px)!important;
                    font-family:'Patrick Hand',cursive!important;
                }

                #versionUpdatePopup .version-popup{
                    background:var(--bg,#000);
                    color:var(--fg,#fff);
                    border:2px solid var(--red,#bb001e);
                    border-radius:20px;
                    padding:30px 24px 24px;
                    width:min(400px,100%);
                    text-align:center;
                    box-shadow:0 10px 40px rgba(0,0,0,.5);
                    animation:versionPopIn .22s ease;
                }

                #versionUpdatePopup h2{
                    font-size:28px;
                    margin:0 0 8px;
                    color:var(--fg,#fff);
                }

                #versionUpdatePopup p{
                    font-size:20px;
                    color:var(--fg2,rgba(255,255,255,.6));
                    margin:0 0 24px;
                    line-height:1.5;
                }

                #versionUpdatePopup button{
                    display:inline-block;
                    width:100%;
                    font-family:'Patrick Hand',cursive;
                    font-size:19px;
                    padding:10px 18px;
                    border-radius:12px;
                    border:2px solid var(--red,#bb001e);
                    background:var(--red,#bb001e);
                    color:#fff;
                    cursor:pointer;
                    transition:.15s;
                }

                #versionUpdatePopup button:hover{
                    background:var(--red-h,#d10022);
                    transform:scale(1.03);
                }

                @keyframes versionPopIn{
                    from{
                        opacity:0;
                        transform:scale(.92) translateY(10px);
                    }
                    to{
                        opacity:1;
                        transform:scale(1) translateY(0);
                    }
                }
            `;

            document.head.appendChild(s);

            const overlay = document.createElement("div");
            overlay.id = "versionUpdatePopup";

            overlay.innerHTML = `
                <div class="version-popup">
                    <h2>Update Available</h2>
                    <p>
                        A newer version of this application is available.
                        Please refresh to continue.
                    </p>
                    <button onclick="location.reload()">Refresh</button>
                </div>
            `;

            document.body.appendChild(overlay);

        } catch (e) {
            console.error("BSMS Web version check failed:", e);
        }
    }

    checkForUpdate();
    setInterval(checkForUpdate, 1000);
})();
