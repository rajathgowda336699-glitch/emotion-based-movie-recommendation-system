document.addEventListener('DOMContentLoaded', function () {
    const moodBtns = document.querySelectorAll('.mood-btn');
    const langBtns = document.querySelectorAll('.lang-btn');
    const moviesGrid = document.getElementById('movies-grid');
    const resultsTitle = document.getElementById('results-title');
    const resultsSection = document.getElementById('results-section');
    const loading = document.getElementById('loading');
    const prevBtn = document.getElementById('prev-btn');
    const nextBtn = document.getElementById('next-btn');
    const pageInfo = document.getElementById('page-info');
    const landingPage = document.getElementById('landing-page');
    const mainApp = document.getElementById('main-app');
    const startAppBtn = document.getElementById('start-app-btn');

    const webcam = document.getElementById('webcam');
    const webcamOverlay = document.getElementById('webcam-overlay');
    const detectionStatus = document.getElementById('detection-status');
    const toggleCameraBtn = document.getElementById('toggle-camera');
    const detectedMoodDisplay = document.getElementById('detected-mood-display');
    const detectedMoodText = document.getElementById('detected-mood-text');

    let currentMood = null;
    let currentLanguage = null;
    let currentPage = 1;
    let totalPages = 1;
    let stream = null;
    let detectionInterval = null;
    let isDetecting = false;
    let modelsLoaded = false;

    if (startAppBtn) {
        startAppBtn.addEventListener('click', () => {
            if (landingPage) landingPage.classList.add('hidden');
            if (mainApp) mainApp.classList.remove('hidden');
            window.scrollTo({ top: 0, behavior: 'smooth' });
        });
    }

    moodBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            moodBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentMood = btn.dataset.mood;
            applyMoodTheme(currentMood);
            currentPage = 1;
            if (currentLanguage) fetchMovies();
        });
    });

    langBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            langBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            currentLanguage = btn.dataset.language;
            currentPage = 1;
            if (currentMood) fetchMovies();
        });
    });

    if (prevBtn) prevBtn.addEventListener('click', () => {
        if (currentPage > 1) {
            currentPage--;
            fetchMovies();
        }
    });

    if (nextBtn) nextBtn.addEventListener('click', () => {
        if (currentPage < totalPages) {
            currentPage++;
            fetchMovies();
        }
    });

    async function fetchMovies() {
        if (!currentMood || !currentLanguage) return;

        if (loading) loading.classList.remove('hidden');
        if (resultsSection) resultsSection.classList.remove('hidden');
        if (moviesGrid) moviesGrid.innerHTML = '';

        try {
            const url = `/movies?emotion=${encodeURIComponent(currentMood)}&language=${encodeURIComponent(currentLanguage)}&page=${currentPage}`;
            const res = await fetch(url);
            const data = await res.json();

            if (!res.ok) {
                if (moviesGrid) moviesGrid.innerHTML = `<p class="error">${data.error || 'Failed to load.'}</p>`;
                return;
            }

            totalPages = data.total_pages || 1;
            currentPage = data.current_page || 1;

            if (resultsTitle) {
                resultsTitle.textContent = `${capitalize(currentMood)} ${currentLanguage} Movies`;
            }

            if (!data.movies.length) {
                if (moviesGrid) moviesGrid.innerHTML = `<p class="empty">No movies found for this combination.</p>`;
            } else if (moviesGrid) {
                moviesGrid.innerHTML = data.movies.map(renderCard).join('');
            }

            if (pageInfo) pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;
            if (prevBtn) prevBtn.disabled = currentPage <= 1;
            if (nextBtn) nextBtn.disabled = currentPage >= totalPages;
        } catch (err) {
            console.error(err);
            if (moviesGrid) moviesGrid.innerHTML = `<p class="error">Network error. Try again.</p>`;
        } finally {
            if (loading) loading.classList.add('hidden');
        }
    }

    function renderCard(m) {
    const safe = (s) => (s == null ? '' : String(s).replace(/[<>'"]/g, c => ({
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;'
    }[c])));

    const movieTitle = m.title || '';

    const trailerUrl = m.trailer_url ||
        `https://www.youtube.com/results?search_query=${encodeURIComponent(`${movieTitle} ${m.year || ''} official trailer`)}`;

    const firstWord = movieTitle.trim().split(/\s+/)[0] || '';
    const cinebyTitle = encodeURIComponent(firstWord);
    const watchUrl = `https://cineby.cc/search?q=${cinebyTitle}`;

    return `
        <article class="movie-card" onclick="window.open('${safe(watchUrl)}', '_blank')">
            <div class="poster-wrap">
                <img class="movie-poster" src="${safe(m.poster)}" alt="${safe(movieTitle)}"
                     loading="lazy"
                     onerror="this.onerror=null;this.src='https://via.placeholder.com/300x450?text=No+Poster'">
            </div>

            <div class="movie-info">
                <h3 class="movie-title">${safe(movieTitle)}</h3>

                <p class="movie-meta">
                    ${m.year ? `<span class="meta-chip">${safe(m.year)}</span>` : ''}
                </p>

                ${m.rating ? `<p class="movie-rating">&#9733; ${safe(m.rating)}</p>` : ''}

                <div class="movie-actions">
                    <button class="trailer-btn" type="button"
                        onclick="event.stopPropagation(); window.open('${safe(trailerUrl)}', '_blank')">
                        Trailer
                    </button>

                    <button class="watch-btn" type="button"
                        onclick="event.stopPropagation(); window.open('${safe(watchUrl)}', '_blank')">
                        Watch Now
                    </button>
                </div>
            </div>
        </article>
    `;
}


    function capitalize(s) {
        return s.charAt(0).toUpperCase() + s.slice(1);
    }

    function applyMoodTheme(mood) {
        document.body.className = document.body.className.replace(/\b\w+-bg\b/g, '').trim();
        if (mood) document.body.classList.add(`${mood}-bg`);

        if (detectedMoodText) {
            detectedMoodText.className = 'detected-mood-text';
            if (mood) detectedMoodText.classList.add(mood);
        }
    }

    async function loadFaceApiModels() {
        if (modelsLoaded) return;

        try {
            const MODEL_URL = 'https://cdn.jsdelivr.net/npm/@vladmandic/face-api@1.7.12/model';
            await faceapi.nets.tinyFaceDetector.loadFromUri(MODEL_URL);
            await faceapi.nets.faceExpressionNet.loadFromUri(MODEL_URL);
            modelsLoaded = true;
        } catch (e) {
            console.error('Failed to load face-api models:', e);
            if (detectionStatus) detectionStatus.textContent = 'Model load failed';
        }
    }

    function mapExpressionToMood(expressions) {
        const scores = {
            happy: expressions.happy || 0,
            sad: expressions.sad || 0,
            angry: expressions.angry || 0,
            relaxed: (expressions.neutral || 0) + (expressions.fear || 0) * 0.3,
            excited: (expressions.surprised || 0) + (expressions.happy || 0) * 0.5,
        };

        let best = 'happy';
        let bestScore = -1;

        for (const [k, v] of Object.entries(scores)) {
            if (v > bestScore) {
                bestScore = v;
                best = k;
            }
        }

        return best;
    }

    async function startCamera() {
        if (stream || !webcam) return;

        try {
            await loadFaceApiModels();

            stream = await navigator.mediaDevices.getUserMedia({
                video: { width: 320, height: 240, facingMode: 'user' },
                audio: false
            });

            webcam.srcObject = stream;
            webcam.classList.add('active');

            if (webcamOverlay) webcamOverlay.style.display = 'none';
            if (toggleCameraBtn) toggleCameraBtn.textContent = 'Stop Camera';

            webcam.onloadedmetadata = () => {
                webcam.play();
                startDetection();
            };
        } catch (err) {
            console.error('Camera error:', err);
            if (detectionStatus) detectionStatus.textContent = 'Camera access denied';
            if (webcamOverlay) webcamOverlay.style.display = 'flex';
            if (toggleCameraBtn) toggleCameraBtn.textContent = 'Enable Camera';
        }
    }

    function stopCamera() {
        if (detectionInterval) {
            clearInterval(detectionInterval);
            detectionInterval = null;
        }

        if (stream) {
            stream.getTracks().forEach(t => t.stop());
            stream = null;
        }

        if (webcam) {
            webcam.srcObject = null;
            webcam.classList.remove('active');
        }

        if (webcamOverlay) webcamOverlay.style.display = 'flex';
        if (detectionStatus) detectionStatus.textContent = 'Click below to enable camera';
        if (toggleCameraBtn) toggleCameraBtn.textContent = 'Enable Camera';
        if (detectedMoodDisplay) detectedMoodDisplay.classList.add('hidden');

        isDetecting = false;
    }

    function startDetection() {
        if (isDetecting || !modelsLoaded || !webcam) return;

        isDetecting = true;

        const canvas = faceapi.createCanvasFromMedia(webcam);
        canvas.id = 'face-canvas';
        canvas.classList.add('active');

        const old = document.getElementById('face-canvas');
        if (old && old.parentNode) old.parentNode.replaceChild(canvas, old);
        else document.querySelector('.webcam-container').appendChild(canvas);

        const displaySize = {
            width: webcam.videoWidth || 320,
            height: webcam.videoHeight || 240
        };

        faceapi.matchDimensions(canvas, displaySize);

        let lastMood = null;
        let moodStableCount = 0;

        detectionInterval = setInterval(async () => {
            try {
                const detections = await faceapi
                    .detectAllFaces(webcam, new faceapi.TinyFaceDetectorOptions())
                    .withFaceExpressions();

                const resized = faceapi.resizeResults(detections, displaySize);
                const ctx = canvas.getContext('2d');

                ctx.clearRect(0, 0, canvas.width, canvas.height);
                faceapi.draw.drawDetections(canvas, resized);
                faceapi.draw.drawFaceExpressions(canvas, resized);

                if (detections.length > 0 && detections[0].expressions) {
                    const mood = mapExpressionToMood(detections[0].expressions);

                    if (mood === lastMood) {
                        moodStableCount++;
                    } else {
                        lastMood = mood;
                        moodStableCount = 0;
                    }

                    if (moodStableCount >= 3) {
                        if (detectedMoodDisplay) detectedMoodDisplay.classList.remove('hidden');

                        if (detectedMoodText) {
                            detectedMoodText.textContent = capitalize(mood);
                            detectedMoodText.className = 'detected-mood-text ' + mood;
                        }

                        moodBtns.forEach(b => {
                            b.classList.remove('active');
                            if (b.dataset.mood === mood) b.classList.add('active');
                        });

                        if (currentMood !== mood) {
                            currentMood = mood;
                            applyMoodTheme(mood);
                            currentPage = 1;
                            if (currentLanguage) fetchMovies();
                        }
                    }
                }
            } catch (e) {
                // Ignore single-frame detection errors.
            }
        }, 500);
    }

    if (toggleCameraBtn) {
        toggleCameraBtn.addEventListener('click', () => {
            if (stream) stopCamera();
            else startCamera();
        });
    }

    function createParticles() {
        const container = document.querySelector('.particles-container');
        if (!container) return;

        for (let i = 0; i < 30; i++) {
            const p = document.createElement('div');
            p.className = 'particle';
            p.style.left = Math.random() * 100 + 'vw';
            p.style.animationDelay = Math.random() * 15 + 's';
            p.style.animationDuration = (10 + Math.random() * 10) + 's';
            container.appendChild(p);
        }
    }

    createParticles();
});