// ===== PARLEZ — French Vocabulary Trainer =====
const app = {
    // State
    words: [],
    sentences: [],
    progress: {},
    queue: [],
    currentExercise: null,
    streak: 0,
    bestStreak: 0,
    totalCorrect: 0,
    totalAttempts: 0,
    sessionStart: null,
    timerInterval: null,
    feedbackVisible: false,
    frenchVoice: null,
    exerciseStartTime: 0,
    roundMistakes: 0,
    sprintActive: false,
    sprintCount: 0,
    sessionMode: 'new',
    settings: {
        mcFrEn: true,
        mcEnFr: true,
        typeFr: true,
        typeEn: true,
        sentFrEn: true,
        sentEnFr: true,
        batchSize: 10,
        ttsEnabled: true,
    },

    // ===== INIT =====
    init() {
        this.words = FRENCH_WORDS;
        this.sentences = typeof FRENCH_SENTENCES !== 'undefined' ? FRENCH_SENTENCES : [];
        this.loadProgress();
        this.loadSettings();
        this.updateUI();
        this.bindEvents();
        this.initTTS();
        gamify.init();
        document.getElementById('total-words').textContent = this.words.length;

        // Mouse Parallax Effect for the Title
        document.addEventListener('mousemove', (e) => {
            const x = (e.clientX / window.innerWidth - 0.5) * 80;
            const y = (e.clientY / window.innerHeight - 0.5) * 80;
            document.documentElement.style.setProperty('--px', `${x}px`);
            document.documentElement.style.setProperty('--py', `${y}px`);
        });

        // Show continue/review if progress exists
        const hasProgress = Object.keys(this.progress).length > 0;
        document.getElementById('btn-continue').style.display = hasProgress ? 'flex' : 'none';
        this.updateReviewBtn();
    },

    // ===== TEXT-TO-SPEECH =====
    initTTS() {
        const loadVoices = () => {
            const voices = speechSynthesis.getVoices();
            // Filter for French voices
            const frenchVoices = voices.filter(v => 
                v.lang.toLowerCase().includes('fr-fr') || 
                v.lang.toLowerCase().includes('fr_fr') ||
                v.lang.toLowerCase().startsWith('fr')
            );
            
            if (frenchVoices.length === 0) {
                console.warn('No French TTS voices detected. Please install a French language pack in your phone settings.');
                return;
            }

            // Try to find a high-quality female French voice first
            const femaleKeywords = ['female', 'amélie', 'amelie', 'virginie', 'marie', 'léa', 'lea', 'céline', 'celine', 'audrey', 'cloe', 'siri', 'google français', 'français'];
            let picked = frenchVoices.find(v => femaleKeywords.some(k => v.name.toLowerCase().includes(k)));
            
            // Fallback to any French voice if no female one found
            if (!picked) picked = frenchVoices[0];
            
            this.frenchVoice = picked;
            console.log('Selected Voice:', picked.name, picked.lang);
        };

        if (speechSynthesis.getVoices().length > 0) {
            loadVoices();
        }
        speechSynthesis.onvoiceschanged = loadVoices;
    },

    speak(text) {
        if (!this.settings.ttsEnabled || !this.frenchVoice) return;
        speechSynthesis.cancel(); // stop any current speech
        const utter = new SpeechSynthesisUtterance(text);
        utter.voice = this.frenchVoice;
        utter.lang = 'fr-FR';
        utter.rate = 0.85;  // slightly slower for learning
        utter.pitch = 1.1;  // slightly higher for feminine sound
        speechSynthesis.speak(utter);
    },

    // ===== PERSISTENCE =====
    loadProgress() {
        try {
            const data = localStorage.getItem('parlez_progress');
            if (data) this.progress = JSON.parse(data);
            const stats = localStorage.getItem('parlez_stats');
            if (stats) {
                const s = JSON.parse(stats);
                this.totalCorrect = s.totalCorrect || 0;
                this.totalAttempts = s.totalAttempts || 0;
                this.bestStreak = s.bestStreak || 0;
            }
        } catch (e) { console.warn('Failed to load progress', e); }
    },

    saveProgress() {
        try {
            localStorage.setItem('parlez_progress', JSON.stringify(this.progress));
            localStorage.setItem('parlez_stats', JSON.stringify({
                totalCorrect: this.totalCorrect,
                totalAttempts: this.totalAttempts,
                bestStreak: this.bestStreak,
            }));
        } catch (e) { console.warn('Failed to save progress', e); }
    },

    loadSettings() {
        try {
            const data = localStorage.getItem('parlez_settings');
            if (data) Object.assign(this.settings, JSON.parse(data));
        } catch (e) {}
        // Apply to UI
        document.getElementById('opt-mc-fr-en').checked = this.settings.mcFrEn;
        document.getElementById('opt-mc-en-fr').checked = this.settings.mcEnFr;
        document.getElementById('opt-type-fr').checked = this.settings.typeFr;
        document.getElementById('opt-type-en').checked = this.settings.typeEn;
        document.getElementById('opt-sent-fr-en').checked = this.settings.sentFrEn;
        document.getElementById('opt-sent-en-fr').checked = this.settings.sentEnFr;
        document.getElementById('opt-batch-size').value = this.settings.batchSize;
        document.getElementById('opt-tts').checked = this.settings.ttsEnabled;
    },

    saveSettings() {
        this.settings.mcFrEn = document.getElementById('opt-mc-fr-en').checked;
        this.settings.mcEnFr = document.getElementById('opt-mc-en-fr').checked;
        this.settings.typeFr = document.getElementById('opt-type-fr').checked;
        this.settings.typeEn = document.getElementById('opt-type-en').checked;
        this.settings.sentFrEn = document.getElementById('opt-sent-fr-en').checked;
        this.settings.sentEnFr = document.getElementById('opt-sent-en-fr').checked;
        this.settings.batchSize = parseInt(document.getElementById('opt-batch-size').value);
        this.settings.ttsEnabled = document.getElementById('opt-tts').checked;
        // Ensure at least one type is checked
        if (!this.settings.mcFrEn && !this.settings.mcEnFr && !this.settings.typeFr && !this.settings.typeEn) {
            this.settings.mcFrEn = true;
            document.getElementById('opt-mc-fr-en').checked = true;
        }
        localStorage.setItem('parlez_settings', JSON.stringify(this.settings));
    },

    // ===== EVENTS =====
    bindEvents() {
        document.getElementById('settings-btn').addEventListener('click', () => this.openSettings());

        document.getElementById('type-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
                if (this.feedbackVisible) {
                    if (this.correctionRequired) {
                        const inputVal = e.target.value.trim().toLowerCase();
                        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''\-–—]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
                        const stripParens = s => s.replace(/\s*\([^)]*\)/g, '').trim();
                        
                        const inputNorm = normalize(inputVal);
                        
                        let isMatch = false;
                        const parts = this.correctionAnswer.split(',').map(s => s.trim());
                        for (const part of parts) {
                            if (inputNorm === normalize(part) || inputNorm === normalize(stripParens(part))) {
                                isMatch = true;
                                break;
                            }
                        }

                        if (isMatch) {
                            this.correctionRequired = false;
                            this.nextExercise();
                        } else {
                            e.target.value = '';
                            e.target.placeholder = 'Try again...';
                        }
                    } else {
                        this.nextExercise();
                    }
                } else {
                    this.checkTyped();
                }
            }
        });

        document.addEventListener('keydown', (e) => {
            // Enter to continue (only when feedback is visible and not in typing input)
            if (e.key === 'Enter' && this.feedbackVisible) {
                const active = document.activeElement;
                const isTypingInput = active && active.id === 'type-input';
                if (!isTypingInput && !this.correctionRequired) {
                    this.nextExercise();
                }
            }
            // Number keys for choices
            if (['1','2','3','4'].includes(e.key) && !this.feedbackVisible) {
                const btns = document.getElementById('choices-container').querySelectorAll('.choice-btn');
                const idx = parseInt(e.key) - 1;
                if (btns[idx] && !btns[idx].classList.contains('disabled')) btns[idx].click();
            }
        });
    },

    // ===== SESSION =====
    startSession(mode) {
        this.sessionStart = Date.now();
        this.streak = 0;
        this.roundMistakes = 0;
        this.sessionMode = mode;
        this.startTimer();
        gamify.resumeAudio();

        if (mode === 'sprint') {
            this.sprintActive = true;
            this.sprintCount = 0;
            // Build all 2000 words as Typing-only for active recall
            const allIndices = Array.from({length: this.words.length}, (_, i) => i);
            this.shuffle(allIndices);
            this.queue = [];
            for (const idx of allIndices) {
                // Alternate between typing French and typing English
                const t = Math.random() < 0.5 ? 'type-fr' : 'type-en';
                this.queue.push({ wordIndex: idx, type: t, isSentence: false });
            }
            document.getElementById('sprint-hud').style.display = 'flex';
            document.getElementById('sprint-total').textContent = this.words.length;
            this.updateSprintHUD();
        } else if (mode === 'speed') {
            this.sprintActive = false;
            this.buildQueue(this.getNewWords(100));
            gamify.startSpeedRound(60);
        } else if (mode === 'sentences') {
            this.buildSentenceQueue(10);
        } else if (mode === 'review') {
            const due = this.getDueWords();
            const weak = this.getWeakWords();
            const combined = [...new Set([...due, ...weak])];
            this.buildQueue(combined.length > 0 ? combined : []);
        } else if (mode === 'typing') {
            const weak = this.getWeakWords().slice(0, Math.ceil(this.settings.batchSize / 2));
            const needed = this.settings.batchSize - weak.length;
            const fresh = this.getNewWords(needed);
            this.buildQueue([...weak, ...fresh], ['type-fr', 'type-en']);
        } else if (mode === 'mc') {
            const weak = this.getWeakWords().slice(0, Math.ceil(this.settings.batchSize / 2));
            const needed = this.settings.batchSize - weak.length;
            const fresh = this.getNewWords(needed);
            this.buildQueue([...weak, ...fresh], ['mc-fr-en', 'mc-en-fr']);
        } else if (mode === 'voice') {
            const weak = this.getWeakWords().slice(0, Math.ceil(this.settings.batchSize / 2));
            const needed = this.settings.batchSize - weak.length;
            const fresh = this.getNewWords(needed);
            this.buildQueue([...weak, ...fresh], ['voice-en']);
        } else {
            const weak = this.getWeakWords().slice(0, Math.ceil(this.settings.batchSize / 2));
            const needed = this.settings.batchSize - weak.length;
            const fresh = this.getNewWords(needed);
            this.buildQueue([...weak, ...fresh]);
        }

        this.showScreen('exercise');
        this.nextExercise();
    },

    getNewWords(count) {
        // 1. SRS due words come first
        const due = this.getDueWords();
        const selection = due.slice(0, count);
        if (selection.length >= count) return selection;

        const dueSet = new Set(selection);
        const remaining = count - selection.length;

        // 2. Fill with unseen words (most frequent first)
        const mastered = [];
        for (const [idx, p] of Object.entries(this.progress)) {
            if (p.mastered) mastered.push(parseInt(idx));
        }

        let unseenIdx = 0;
        for (let i = 0; i < remaining; i++) {
            if (mastered.length > 0 && Math.random() < 0.1) {
                const r = Math.floor(Math.random() * mastered.length);
                if (!dueSet.has(mastered[r])) selection.push(mastered[r]);
            } else {
                while (unseenIdx < this.words.length && this.progress[unseenIdx]) {
                    unseenIdx++;
                }
                if (unseenIdx < this.words.length) {
                    selection.push(unseenIdx);
                    unseenIdx++;
                } else if (mastered.length > 0) {
                    const r = Math.floor(Math.random() * mastered.length);
                    selection.push(mastered[r]);
                }
            }
        }
        return selection;
    },

    getDueWords() {
        const now = Date.now();
        const due = [];
        for (const [idx, p] of Object.entries(this.progress)) {
            if (p.nextReview && p.nextReview <= now) {
                due.push(parseInt(idx));
            }
        }
        // Most overdue first
        due.sort((a, b) => (this.progress[a].nextReview || 0) - (this.progress[b].nextReview || 0));
        return due;
    },

    // SM-2 spaced repetition algorithm
    updateSRS(idx, isCorrect, responseTimeMs) {
        const p = this.progress[idx];
        if (p.easeFactor === undefined) p.easeFactor = 2.5;
        if (p.interval === undefined) p.interval = 0;
        if (p.repetitions === undefined) p.repetitions = 0;

        if (!isCorrect) {
            // Forgot — reset card, review again tomorrow
            p.repetitions = 0;
            p.interval = 1;
            p.nextReview = Date.now() + 24 * 60 * 60 * 1000;
            p.mastered = false;
            return;
        }

        // Quality score based on response speed
        let quality;
        if (responseTimeMs < 3000)      quality = 5; // perfect
        else if (responseTimeMs < 7000) quality = 4; // good
        else                            quality = 3; // slow but correct

        // Calculate new interval
        p.repetitions++;
        if (p.repetitions === 1) {
            p.interval = 1;
        } else if (p.repetitions === 2) {
            p.interval = 6;
        } else {
            p.interval = Math.round(p.interval * p.easeFactor);
        }

        // Update ease factor (min 1.3)
        p.easeFactor = Math.max(1.3,
            p.easeFactor + 0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02)
        );

        p.nextReview = Date.now() + p.interval * 24 * 60 * 60 * 1000;

        // Mastered = stable long-term memory (interval ≥ 21 days)
        p.mastered = p.interval >= 21;
    },

    getWeakWords() {
        const weak = [];
        for (const [idx, p] of Object.entries(this.progress)) {
            if (!p.mastered && p.incorrect > 0) weak.push(parseInt(idx));
        }
        // Sort by error rate descending
        weak.sort((a, b) => {
            const rA = this.progress[a].incorrect / (this.progress[a].correct + this.progress[a].incorrect);
            const rB = this.progress[b].incorrect / (this.progress[b].correct + this.progress[b].incorrect);
            return rB - rA;
        });
        return weak.slice(0, 50);
    },

    getMasteredCount() {
        return Object.values(this.progress).filter(p => p.mastered).length;
    },

    buildQueue(wordIndices, overrideTypes = null) {
        this.queue = [];
        let types = [];
        if (overrideTypes) {
            types = overrideTypes;
        } else {
            if (this.settings.mcFrEn) types.push('mc-fr-en');
            if (this.settings.mcEnFr) types.push('mc-en-fr');
            if (this.settings.typeFr) types.push('type-fr');
            if (this.settings.typeEn) types.push('type-en');
        }

        for (const idx of wordIndices) {
            const shuffledTypes = this.shuffle([...types]);
            // If only 1 type was provided (e.g., voice-en), we want to make sure it plays
            const typesToPush = shuffledTypes.length > 1 ? shuffledTypes.slice(0, 2) : shuffledTypes;
            for (const t of typesToPush) {
                this.queue.push({ wordIndex: idx, type: t });
            }
        }
        this.shuffle(this.queue);
    },

    buildSentenceQueue(count, append) {
        if (!append) this.queue = [];
        if (this.sentences.length === 0) return;
        const types = [];
        if (this.settings.sentFrEn) types.push('sent-fr-en');
        if (this.settings.sentEnFr) types.push('sent-en-fr');
        if (types.length === 0) { types.push('sent-fr-en'); }
        // Pick random sentences
        const indices = [];
        const pool = [...Array(this.sentences.length).keys()];
        this.shuffle(pool);
        for (let i = 0; i < Math.min(count, pool.length); i++) indices.push(pool[i]);
        for (const idx of indices) {
            const t = types[Math.floor(Math.random() * types.length)];
            this.queue.push({ sentenceIndex: idx, type: t, isSentence: true });
        }
        this.shuffle(this.queue);
    },

    // ===== EXERCISES =====
    nextExercise() {
        this.feedbackVisible = false;
        document.getElementById('feedback').style.display = 'none';

        if (this.queue.length === 0) {
            if (this.sprintActive) {
                // Sprint complete!
                this.sprintActive = false;
                document.getElementById('sprint-hud').style.display = 'none';
                gamify.sfxLevelUp();
                alert(`\ud83c\udfc6 SPRINT COMPLETE!\n\n${this.sprintCount} words attempted\n${this.totalCorrect} correct\n${Math.round(this.totalCorrect/this.totalAttempts*100)}% accuracy\n\nYou are incredible!`);
                this.showScreen('start');
                return;
            } else if (this.sessionMode === 'sentences') {
                this.buildSentenceQueue(10);
            } else if (this.sessionMode === 'mixed') {
                const weak = this.getWeakWords().slice(0, Math.ceil(this.settings.batchSize / 2));
                const needed = this.settings.batchSize - weak.length;
                const fresh = this.getNewWords(needed);
                if (fresh.length === 0 && weak.length === 0) {
                    this.buildSentenceQueue(10);
                } else {
                    this.buildQueue([...weak, ...fresh]);
                    this.buildSentenceQueue(5, true);
                }
            } else {
                const weak = this.getWeakWords().slice(0, Math.ceil(this.settings.batchSize / 2));
                const needed = this.settings.batchSize - weak.length;
                const fresh = this.getNewWords(needed);
                if (fresh.length === 0 && weak.length === 0) {
                    alert('🎉 Incredible! You\'ve mastered all ' + this.words.length + ' words!');
                    this.showScreen('start');
                    return;
                }
                this.buildQueue([...weak, ...fresh]);
            }
        }

        this.currentExercise = this.queue.shift();
        this.exerciseStartTime = Date.now();
        if (this.sprintActive) {
            this.sprintCount++;
            this.updateSprintHUD();
        }
        this.renderExercise();
    },

    updateSprintHUD() {
        const el = document.getElementById('sprint-current');
        const pctEl = document.getElementById('sprint-pct');
        if (el) el.textContent = this.sprintCount;
        if (pctEl) pctEl.textContent = Math.round((this.sprintCount / this.words.length) * 100) + '%';
    },

    renderExercise() {
        const ex = this.currentExercise;
        const choicesEl = document.getElementById('choices-container');
        const typingEl = document.getElementById('typing-container');
        const labelEl = document.getElementById('exercise-type-label');
        const promptEl = document.getElementById('exercise-prompt');
        const hintEl = document.getElementById('exercise-hint');

        choicesEl.innerHTML = '';
        choicesEl.style.display = 'none';
        typingEl.style.display = 'none';
        document.getElementById('accent-bar').style.display = 'none';

        const input = document.getElementById('type-input');
        input.value = '';
        input.className = 'type-input';
        input.disabled = false;
        document.getElementById('type-submit').disabled = false;
        promptEl.innerHTML = '';

        // === SENTENCE EXERCISES ===
        if (ex.isSentence) {
            const sent = this.sentences[ex.sentenceIndex];
            if (ex.type === 'sent-fr-en') {
                labelEl.textContent = 'Translate this sentence to English';
                this.setPromptWithSpeaker(promptEl, sent.fr, true);
                hintEl.textContent = sent.cat ? `Category: ${sent.cat}` : '';
                typingEl.style.display = 'flex';
                input.placeholder = 'Type the English translation...';
                setTimeout(() => input.focus(), 50);
                this.speak(sent.fr);
            } else {
                labelEl.textContent = 'Translate this sentence to French';
                promptEl.textContent = sent.en;
                hintEl.textContent = `Hint: ${sent.fr.split(' ')[0]}...`;
                typingEl.style.display = 'flex';
                document.getElementById('accent-bar').style.display = 'flex';
                input.placeholder = 'Type the French translation...';
                setTimeout(() => input.focus(), 50);
            }
            return;
        }

        // === WORD EXERCISES ===
        const word = this.words[ex.wordIndex];
        if (ex.type === 'mc-fr-en') {
            labelEl.textContent = 'What does this mean?';
            this.setPromptWithSpeaker(promptEl, word.fr, true);
            hintEl.textContent = word.hint || '';
            choicesEl.style.display = 'grid';
            this.renderChoices(word.en, 'en');
            this.speak(word.fr);
        } else if (ex.type === 'mc-en-fr') {
            labelEl.textContent = 'How do you say this in French?';
            promptEl.textContent = word.en;
            hintEl.textContent = '';
            choicesEl.style.display = 'grid';
            this.renderChoices(word.fr, 'fr');
        } else if (ex.type === 'type-fr') {
            labelEl.textContent = 'Type the French word';
            promptEl.textContent = word.en;
            hintEl.textContent = `Hint: ${word.fr.charAt(0)}${'_'.repeat(Math.max(0, word.fr.length - 1))}`;
            typingEl.style.display = 'flex';
            document.getElementById('accent-bar').style.display = 'flex';
            input.placeholder = 'Type in French...';
            setTimeout(() => input.focus(), 50);
        } else if (ex.type === 'type-en') {
            labelEl.textContent = 'Type the English translation';
            this.setPromptWithSpeaker(promptEl, word.fr, true);
            const enFirst = word.en.split(',')[0].trim();
            hintEl.textContent = `Hint: ${enFirst.charAt(0)}${'_'.repeat(Math.max(0, enFirst.length - 1))}`;
            typingEl.style.display = 'flex';
            input.placeholder = 'Type in English...';
            setTimeout(() => input.focus(), 50);
            this.speak(word.fr);
        } else if (ex.type === 'voice-en') {
            labelEl.textContent = 'Listen and type the English translation';
            promptEl.innerHTML = '';
            
            const speakerBtn = document.createElement('button');
            speakerBtn.className = 'speaker-btn';
            speakerBtn.style.fontSize = '3rem';
            speakerBtn.style.width = '80px';
            speakerBtn.style.height = '80px';
            speakerBtn.style.borderRadius = '50%';
            speakerBtn.textContent = '🔊';
            speakerBtn.title = 'Listen';
            speakerBtn.onclick = () => this.speak(word.fr);
            promptEl.appendChild(speakerBtn);

            const enFirst = word.en.split(',')[0].trim();
            hintEl.textContent = `Hint: ${enFirst.charAt(0)}${'_'.repeat(Math.max(0, enFirst.length - 1))}`;
            typingEl.style.display = 'flex';
            input.placeholder = 'Type in English...';
            setTimeout(() => input.focus(), 50);
            this.speak(word.fr);
        }
    },

    setPromptWithSpeaker(el, text, isFrench) {
        el.innerHTML = '';
        const span = document.createElement('span');
        span.textContent = text;
        el.appendChild(span);

        if (isFrench) {
            const btn = document.createElement('button');
            btn.className = 'speaker-btn';
            btn.textContent = '🔊';
            btn.title = 'Listen again';
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                this.speak(text);
                btn.classList.add('speaking');
                setTimeout(() => btn.classList.remove('speaking'), 600);
            });
            el.appendChild(btn);
        }
    },

    renderChoices(correctAnswer, lang) {
        const container = document.getElementById('choices-container');
        // Pick 3 random wrong answers
        const distractors = this.getDistractors(this.currentExercise.wordIndex, lang, 3);
        const options = this.shuffle([correctAnswer, ...distractors]);

        for (const opt of options) {
            const btn = document.createElement('button');
            btn.className = 'choice-btn';
            btn.textContent = opt;
            btn.addEventListener('click', () => this.checkChoice(opt, correctAnswer, container));
            container.appendChild(btn);
        }
    },

    getDistractors(wordIndex, lang, count) {
        const correct = this.words[wordIndex][lang];
        const pool = [];
        // Prefer words close in frequency rank for harder distractors
        const start = Math.max(0, wordIndex - 30);
        const end = Math.min(this.words.length, wordIndex + 30);
        for (let i = start; i < end; i++) {
            if (i !== wordIndex && this.words[i][lang] !== correct) {
                pool.push(this.words[i][lang]);
            }
        }
        // Fill from random if not enough
        while (pool.length < count) {
            const r = Math.floor(Math.random() * this.words.length);
            if (r !== wordIndex && this.words[r][lang] !== correct && !pool.includes(this.words[r][lang])) {
                pool.push(this.words[r][lang]);
            }
        }
        return this.shuffle(pool).slice(0, count);
    },

    // ===== CHECKING =====
    checkChoice(selected, correct, container) {
        const btns = container.querySelectorAll('.choice-btn');
        const isCorrect = selected === correct;

        btns.forEach(b => {
            b.classList.add('disabled');
            if (b.textContent === correct) b.classList.add('correct');
            if (b.textContent === selected && !isCorrect) b.classList.add('incorrect');
        });

        this.recordResult(isCorrect, correct);
    },

    checkTyped() {
        const input = document.getElementById('type-input');
        const answer = input.value.trim();
        if (!answer) return;

        const ex = this.currentExercise;
        let correct, isCorrect;

        // Normalize: lowercase, strip accents & punctuation (apostrophes, hyphens, etc.) but keep letters & spaces
        // English spelling must be correct; punctuation (apostrophes, hyphens) is ignored
        const normalize = s => s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[''\-–—]/g, '').replace(/[^a-z ]/g, '').replace(/\s+/g, ' ').trim();
        const stripParens = s => s.replace(/\s*\([^)]*\)/g, '').trim();

        if (ex.isSentence) {
            // Sentence exercise — use fuzzy matching
            const sent = this.sentences[ex.sentenceIndex];
            correct = ex.type === 'sent-fr-en' ? sent.en : sent.fr;
            isCorrect = this.fuzzyMatch(normalize(answer), normalize(correct));
        } else {
            // Word exercise — exact matching with lenient rules
            const word = this.words[ex.wordIndex];
            correct = ex.type === 'type-fr' ? word.fr : word.en;
            const acceptedForms = new Set();
            const parts = correct.split(',').map(s => s.trim());
            for (const part of parts) {
                acceptedForms.add(normalize(part));
                acceptedForms.add(normalize(stripParens(part)));
            }
            acceptedForms.add(normalize(stripParens(correct)));
            isCorrect = acceptedForms.has(normalize(answer));
        }

        input.classList.add(isCorrect ? 'correct' : 'incorrect');
        input.disabled = true;
        document.getElementById('type-submit').disabled = true;

        this.recordResult(isCorrect, correct);
    },

    // Fuzzy matching for sentences: checks word overlap ratio
    fuzzyMatch(answer, correct) {
        if (answer === correct) return true;
        // Tokenize into words, removing very short filler words for comparison
        const stopWords = new Set(['a','an','the','le','la','les','un','une','des','de','du','l','d','i','it','is','am','are','to','in','at','on','et','je','tu','il','ce','se','me','te','ne','en','y','s','n','j','c','qu']);
        const getKeyWords = s => s.split(' ').filter(w => w.length > 0 && !stopWords.has(w));
        const answerWords = getKeyWords(answer);
        const correctWords = getKeyWords(correct);
        if (correctWords.length === 0) return answer === correct;
        // Count matches
        let matches = 0;
        const used = new Set();
        for (const aw of answerWords) {
            for (let i = 0; i < correctWords.length; i++) {
                if (!used.has(i) && (aw === correctWords[i] || this.levenshtein(aw, correctWords[i]) <= 1)) {
                    matches++;
                    used.add(i);
                    break;
                }
            }
        }
        const ratio = matches / correctWords.length;
        return ratio >= 0.65;
    },

    levenshtein(a, b) {
        const m = a.length, n = b.length;
        const dp = Array.from({length: m + 1}, (_, i) => i);
        for (let j = 1; j <= n; j++) {
            let prev = dp[0];
            dp[0] = j;
            for (let i = 1; i <= m; i++) {
                const tmp = dp[i];
                dp[i] = a[i-1] === b[j-1] ? prev : 1 + Math.min(prev, dp[i], dp[i-1]);
                prev = tmp;
            }
        }
        return dp[m];
    },

    recordResult(isCorrect, correctAnswer) {
        const ex = this.currentExercise;
        const frText = ex.isSentence ? this.sentences[ex.sentenceIndex].fr : this.words[ex.wordIndex].fr;
        const enText = ex.isSentence ? this.sentences[ex.sentenceIndex].en : this.words[ex.wordIndex].en;

        // Only track progress for word exercises
        if (!ex.isSentence) {
            const idx = ex.wordIndex;
            if (!this.progress[idx]) {
                this.progress[idx] = { correct: 0, incorrect: 0, lastSeen: 0, mastered: false };
            }
            const p = this.progress[idx];
            p.lastSeen = Date.now();
            if (isCorrect) {
                p.correct++;
            } else {
                p.incorrect++;
            }
            this.updateSRS(idx, isCorrect, responseTime);
        }

        this.totalAttempts++;
        const responseTime = Date.now() - this.exerciseStartTime;
        if (isCorrect) {
            this.totalCorrect++;
            this.streak++;
            if (this.streak > this.bestStreak) this.bestStreak = this.streak;
            const xpBase = ex.isSentence ? 20 : 10;
            const xpEarned = gamify.awardXP(xpBase, true, responseTime);
            gamify.sfxCorrect();
            gamify.trackDaily('correctAnswers', 1);
            gamify.trackDaily('streakBest', this.streak);
            if (ex.isSentence) gamify.sentencesDone++;
            if (!ex.isSentence && this.progress[ex.wordIndex] && this.progress[ex.wordIndex].correct === 1) {
                gamify.trackDaily('wordsLearned', 1);
            }
            if (gamify.speedRoundActive) gamify.addSpeedPoints(xpEarned);
            this.showFeedback(true, correctAnswer, frText, enText);
            if (this.streak > 0 && this.streak % 5 === 0) this.showStreakFlash();
        } else {
            this.streak = 0;
            this.roundMistakes++;
            gamify.awardXP(0, false, responseTime);
            gamify.sfxWrong();
            this.queue.push({ ...this.currentExercise });
            this.showFeedback(false, correctAnswer, frText, enText);
        }
        this.speak(frText);

        // Check achievements
        gamify.checkAchievements({
            streak: this.streak,
            mastered: this.getMasteredCount(),
            totalCorrect: this.totalCorrect,
            totalAttempts: this.totalAttempts,
            combo: gamify.combo,
            level: gamify.level,
            sentencesDone: gamify.sentencesDone,
            roundPerfect: this.queue.length === 0 && this.roundMistakes === 0,
        });

        this.saveProgress();
        this.updateUI();

        // Speed round: auto-advance after brief feedback
        if (gamify.speedRoundActive) {
            setTimeout(() => this.nextExercise(), isCorrect ? 600 : 1200);
        }
    },

    showFeedback(isCorrect, correctAnswer, frText, enText) {
        this.feedbackVisible = true;
        const fb = document.getElementById('feedback');
        fb.style.display = 'block';
        fb.className = 'feedback ' + (isCorrect ? 'correct-feedback' : 'incorrect-feedback');
        document.getElementById('feedback-icon').textContent = isCorrect ? '✅' : '❌';
        document.getElementById('feedback-text').textContent = isCorrect ? 'Correct!' : 'Not quite!';

        // Build detail with speaker button
        const detailEl = document.getElementById('feedback-detail');
        detailEl.innerHTML = '';
        const textSpan = document.createElement('span');
        textSpan.textContent = `${frText} = ${enText}`;
        detailEl.appendChild(textSpan);

        const speakerBtn = document.createElement('button');
        speakerBtn.className = 'speaker-btn speaker-btn-sm';
        speakerBtn.textContent = '🔊';
        speakerBtn.title = 'Listen';
        speakerBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            this.speak(frText);
        });
        detailEl.appendChild(speakerBtn);

        if (!isCorrect) {
            this.correctionRequired = true;
            this.correctionAnswer = correctAnswer;
            document.getElementById('choices-container').style.display = 'none';
            const typingEl = document.getElementById('typing-container');
            typingEl.style.display = 'flex';
            // Show accent bar if the correction requires typing French
            const ex = this.currentExercise;
            const needsFrench = ex && (ex.type === 'type-fr' || ex.type === 'sent-en-fr');
            document.getElementById('accent-bar').style.display = needsFrench ? 'flex' : 'none';
            
            const input = document.getElementById('type-input');
            input.disabled = false;
            input.value = '';
            const stripP = s => s.replace(/\s*\([^)]*\)/g, '').trim();
            const firstValidAnswer = stripP(correctAnswer.split(',')[0].trim());
            input.placeholder = `Correction required: type '${firstValidAnswer}'`;
            document.getElementById('type-submit').disabled = false;
            
            const instruct = document.createElement('div');
            instruct.style.color = '#fca5a5';
            instruct.style.fontWeight = 'bold';
            instruct.style.marginTop = '8px';
            instruct.textContent = 'Type the correct answer to continue';
            detailEl.appendChild(instruct);
            
            setTimeout(() => input.focus(), 50);
        } else {
            this.correctionRequired = false;
        }
    },

    showStreakFlash() {
        const el = document.createElement('div');
        el.className = 'streak-flash';
        el.textContent = `🔥 ${this.streak} streak!`;
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 900);
    },

    // ===== UI =====
    updateReviewBtn() {
        const dueCount = this.getDueWords().length;
        const weakCount = this.getWeakWords().length;
        const total = dueCount + weakCount;
        const btn = document.getElementById('btn-review');
        btn.style.display = total > 0 ? 'flex' : 'none';
        if (total > 0) {
            const parts = [];
            if (dueCount > 0) parts.push(`📅 ${dueCount} due`);
            if (weakCount > 0) parts.push(`⚠️ ${weakCount} weak`);
            btn.querySelector('.mode-desc').textContent = parts.join(' · ');
        }
    },

    updateUI() {
        const mastered = this.getMasteredCount();
        document.getElementById('streak-count').textContent = this.streak;
        document.getElementById('mastered-count').textContent = mastered;
        const pct = this.words.length > 0 ? Math.round((mastered / this.words.length) * 100) : 0;
        document.getElementById('progress-bar').style.width = pct + '%';
        document.getElementById('progress-text').textContent = pct + '% mastered';
        const accuracy = this.totalAttempts > 0 ? Math.round((this.totalCorrect / this.totalAttempts) * 100) : 0;
        document.getElementById('accuracy-pct').textContent = accuracy + '%';
        this.updateReviewBtn();
    },

    startTimer() {
        if (this.timerInterval) clearInterval(this.timerInterval);
        this.timerInterval = setInterval(() => {
            if (!this.sessionStart) return;
            const elapsed = Math.floor((Date.now() - this.sessionStart) / 1000);
            const h = Math.floor(elapsed / 3600);
            const m = Math.floor((elapsed % 3600) / 60);
            const s = elapsed % 60;
            const timeStr = h > 0
                ? `${h}:${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`
                : `${m}:${String(s).padStart(2,'0')}`;
            document.getElementById('session-time').textContent = timeStr;
        }, 1000);
    },

    showScreen(name) {
        const app = document.getElementById('app');
        document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
        document.getElementById('screen-' + name).classList.add('active');
        
        if (name === 'exercise') {
            app.classList.add('immersive-mode');
        } else {
            app.classList.remove('immersive-mode');
        }
    },

    // ===== SETTINGS =====
    openSettings() {
        document.getElementById('settings-modal').style.display = 'flex';
    },

    closeSettings() {
        this.saveSettings();
        document.getElementById('settings-modal').style.display = 'none';
    },

    resetProgress() {
        if (confirm('Are you sure? This will erase all your progress!')) {
            document.getElementById('settings-modal').style.display = 'none';

            // 1. Wipe Memory State
            this.progress = {};
            this.totalCorrect = 0;
            this.totalAttempts = 0;
            this.streak = 0;
            this.bestStreak = 0;
            
            gamify.xp = 0;
            gamify.level = 1;
            gamify.combo = 0;
            gamify.unlockedAchievements.clear();
            gamify.dailyGoals = { wordsLearned: 0, correctAnswers: 0, minutesPracticed: 0, streakBest: 0 };

            // 2. Wipe Local Storage explicitly
            localStorage.removeItem('parlez_progress');
            localStorage.removeItem('parlez_stats');
            localStorage.removeItem('parlez_gamify');
            localStorage.removeItem('parlez_daily_date');

            // 3. Force save the blank states so if the browser caches storage on unload, it caches the blank state
            this.saveProgress();
            gamify.saveState();

            // 4. Reload the page safely (without deprecated boolean args)
            window.location.href = window.location.href;
        }
    },

    // ===== ACCENT INSERTION =====
    insertAccent(char) {
        const input = document.getElementById('type-input');
        const start = input.selectionStart;
        const end = input.selectionEnd;
        const val = input.value;
        input.value = val.slice(0, start) + char + val.slice(end);
        input.selectionStart = input.selectionEnd = start + char.length;
        input.focus();
    },

    // ===== UTILS =====
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    },
    showAchievements() {
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.style.display = 'flex';
        const content = document.createElement('div');
        content.className = 'modal-content';
        content.style.maxHeight = '70vh';
        content.style.overflow = 'auto';
        content.innerHTML = `<h2>🏆 Achievements (${gamify.unlockedAchievements.size}/${gamify.achievements.length})</h2>`;
        const grid = document.createElement('div');
        grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:8px;';
        gamify.achievements.forEach(a => {
            const unlocked = gamify.unlockedAchievements.has(a.id);
            const card = document.createElement('div');
            card.style.cssText = `padding:12px;border-radius:10px;border:1px solid ${unlocked ? 'var(--accent)' : 'var(--border)'};background:${unlocked ? 'var(--bg-card-hover)' : 'var(--bg-card)'};opacity:${unlocked ? '1' : '0.4'};`;
            card.innerHTML = `<div style="font-size:1.5rem">${a.icon}</div><div style="font-size:0.85rem;font-weight:600">${a.title}</div><div style="font-size:0.7rem;color:var(--text-muted)">${a.desc}</div>`;
            grid.appendChild(card);
        });
        content.appendChild(grid);
        const closeBtn = document.createElement('button');
        closeBtn.className = 'btn-primary';
        closeBtn.style.marginTop = '16px';
        closeBtn.textContent = 'Close';
        closeBtn.onclick = () => modal.remove();
        content.appendChild(closeBtn);
        modal.appendChild(content);
        modal.addEventListener('click', (e) => { if (e.target === modal) modal.remove(); });
        document.body.appendChild(modal);
    },
};

// Boot
document.addEventListener('DOMContentLoaded', () => app.init());
