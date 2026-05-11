// ===== GAMIFICATION ENGINE =====
const gamify = {
    xp: 0,
    level: 1,
    combo: 0,
    comboTimer: null,
    comboTimeLimit: 4000, // ms to keep combo alive
    lastAnswerTime: 0,
    dailyGoals: { wordsLearned: 0, correctAnswers: 0, minutesPracticed: 0, streakBest: 0 },
    dailyTargets: { wordsLearned: 100, correctAnswers: 200, minutesPracticed: 120, streakBest: 20 },
    achievements: [],
    unlockedAchievements: new Set(),
    soundEnabled: true,
    audioCtx: null,

    // XP required per level (increases)
    xpForLevel(lvl) { return Math.floor(50 * Math.pow(lvl, 1.5)); },

    init() {
        this.loadState();
        this.initAudio();
        this.defineAchievements();
        this.renderXPBar();
        this.renderDailyGoals();
        this.renderAchievementCount();
        this.checkDailyReset();
    },

    // ===== AUDIO ENGINE (procedural, no files) =====
    initAudio() {
        try { this.audioCtx = new (window.AudioContext || window.webkitAudioContext)(); }
        catch(e) { console.warn('No Web Audio'); }
    },

    resumeAudio() {
        if (this.audioCtx && this.audioCtx.state === 'suspended') this.audioCtx.resume();
    },

    playTone(freq, duration, type, volume) {
        if (!this.soundEnabled || !this.audioCtx) return;
        this.resumeAudio();
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.type = type || 'sine';
        osc.frequency.value = freq;
        gain.gain.setValueAtTime(volume || 0.15, this.audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.audioCtx.currentTime + duration);
        osc.start();
        osc.stop(this.audioCtx.currentTime + duration);
    },

    sfxCorrect() {
        this.playTone(523, 0.1, 'sine', 0.12);
        setTimeout(() => this.playTone(659, 0.1, 'sine', 0.12), 80);
        setTimeout(() => this.playTone(784, 0.15, 'sine', 0.1), 160);
    },

    sfxWrong() {
        this.playTone(200, 0.15, 'sawtooth', 0.08);
        setTimeout(() => this.playTone(180, 0.2, 'sawtooth', 0.06), 100);
    },

    sfxLevelUp() {
        const notes = [523, 659, 784, 1047];
        notes.forEach((n, i) => setTimeout(() => this.playTone(n, 0.2, 'sine', 0.15), i * 120));
    },

    sfxAchievement() {
        const notes = [784, 988, 1175, 1318, 1568];
        notes.forEach((n, i) => setTimeout(() => this.playTone(n, 0.15, 'triangle', 0.12), i * 80));
    },

    sfxCombo() {
        this.playTone(880 + this.combo * 40, 0.08, 'sine', 0.1);
    },

    sfxTick() {
        this.playTone(1000, 0.03, 'square', 0.05);
    },

    // ===== XP & LEVELS =====
    awardXP(base, isCorrect, responseTimeMs) {
        if (!isCorrect) { this.combo = 0; this.updateComboDisplay(); return 0; }

        // Combo system
        this.combo++;
        if (this.comboTimer) clearTimeout(this.comboTimer);
        this.comboTimer = setTimeout(() => { this.combo = 0; this.updateComboDisplay(); }, this.comboTimeLimit);

        // Speed bonus: faster answer = more XP
        let speedMult = 1;
        if (responseTimeMs < 2000) speedMult = 2;
        else if (responseTimeMs < 4000) speedMult = 1.5;
        else if (responseTimeMs < 6000) speedMult = 1.2;

        // Combo multiplier
        const comboMult = 1 + Math.min(this.combo, 20) * 0.1; // max 3x at 20 combo

        const total = Math.round(base * speedMult * comboMult);
        this.xp += total;

        // Check level up
        while (this.xp >= this.xpForLevel(this.level)) {
            this.xp -= this.xpForLevel(this.level);
            this.level++;
            this.onLevelUp();
        }

        this.updateComboDisplay();
        this.renderXPBar();
        this.showXPPopup(total, speedMult, comboMult);
        this.saveState();
        return total;
    },

    onLevelUp() {
        this.sfxLevelUp();
        // Big level-up overlay
        const overlay = document.createElement('div');
        overlay.className = 'levelup-overlay';
        overlay.innerHTML = `
            <div class="levelup-content">
                <div class="levelup-stars">⭐</div>
                <div class="levelup-title">LEVEL UP!</div>
                <div class="levelup-level">${this.level}</div>
                <div class="levelup-subtitle">${this.getLevelTitle()}</div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('show'), 50);
        setTimeout(() => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 400); }, 2200);
    },

    getLevelTitle() {
        const titles = [
            'Débutant','Curieux','Explorateur','Apprenti','Élève',
            'Étudiant','Pratiquant','Intermédiaire','Avancé','Expert',
            'Maître','Virtuose','Génie','Légende','Dieu du Français'
        ];
        return titles[Math.min(Math.floor((this.level - 1) / 3), titles.length - 1)];
    },

    showXPPopup(amount, speedMult, comboMult) {
        const el = document.createElement('div');
        el.className = 'xp-popup';
        let text = `+${amount} XP`;
        if (comboMult > 1.1) text += ` 🔥${this.combo}x`;
        if (speedMult > 1.1) text += ' ⚡';
        el.textContent = text;
        // Position near the XP bar
        const bar = document.getElementById('xp-bar-container');
        if (bar) {
            const rect = bar.getBoundingClientRect();
            el.style.left = rect.left + rect.width / 2 + 'px';
            el.style.top = rect.bottom + 5 + 'px';
        }
        document.body.appendChild(el);
        setTimeout(() => el.remove(), 1000);
    },

    updateComboDisplay() {
        const el = document.getElementById('combo-display');
        if (!el) return;
        if (this.combo >= 2) {
            el.style.display = 'flex';
            el.querySelector('.combo-count').textContent = this.combo;
            el.querySelector('.combo-mult').textContent = `${(1 + Math.min(this.combo, 20) * 0.1).toFixed(1)}x`;
            el.classList.remove('combo-pulse');
            void el.offsetWidth; // reflow
            el.classList.add('combo-pulse');
        } else {
            el.style.display = 'none';
        }
    },

    // ===== DAILY GOALS =====
    checkDailyReset() {
        const today = new Date().toDateString();
        const stored = localStorage.getItem('parlez_daily_date');
        if (stored !== today) {
            this.dailyGoals = { wordsLearned: 0, correctAnswers: 0, minutesPracticed: 0, streakBest: 0 };
            localStorage.setItem('parlez_daily_date', today);
            this.saveState();
        }
    },

    trackDaily(key, value) {
        this.dailyGoals[key] = (key === 'streakBest')
            ? Math.max(this.dailyGoals[key], value)
            : this.dailyGoals[key] + value;
        this.renderDailyGoals();
        this.saveState();
    },

    renderDailyGoals() {
        const container = document.getElementById('daily-goals');
        if (!container) return;
        const goals = [
            { key: 'correctAnswers', icon: '✅', label: 'Correct', target: this.dailyTargets.correctAnswers },
            { key: 'wordsLearned', icon: '📖', label: 'New Words', target: this.dailyTargets.wordsLearned },
            { key: 'streakBest', icon: '🔥', label: 'Best Streak', target: this.dailyTargets.streakBest },
        ];
        container.innerHTML = goals.map(g => {
            const pct = Math.min(100, Math.round((this.dailyGoals[g.key] / g.target) * 100));
            const done = pct >= 100;
            return `<div class="daily-goal ${done ? 'daily-done' : ''}">
                <span class="daily-icon">${g.icon}</span>
                <div class="daily-info">
                    <div class="daily-label">${g.label}</div>
                    <div class="daily-bar-bg"><div class="daily-bar-fill" style="width:${pct}%"></div></div>
                </div>
                <span class="daily-nums">${this.dailyGoals[g.key]}/${g.target}</span>
            </div>`;
        }).join('');
    },

    // ===== ACHIEVEMENTS =====
    defineAchievements() {
        this.achievements = [
            { id: 'first_word', icon: '🌱', title: 'First Steps', desc: 'Get your first word correct' },
            { id: 'streak_5', icon: '🔥', title: 'Warming Up', desc: 'Get a 5 streak' },
            { id: 'streak_10', icon: '💥', title: 'On Fire', desc: 'Get a 10 streak' },
            { id: 'streak_25', icon: '🌋', title: 'Unstoppable', desc: 'Get a 25 streak' },
            { id: 'streak_50', icon: '☄️', title: 'Legendary', desc: 'Get a 50 streak' },
            { id: 'words_10', icon: '📗', title: 'Getting Started', desc: 'Master 10 words' },
            { id: 'words_50', icon: '📘', title: 'Building Blocks', desc: 'Master 50 words' },
            { id: 'words_100', icon: '📙', title: 'Century Club', desc: 'Master 100 words' },
            { id: 'words_250', icon: '📕', title: 'Dedicated', desc: 'Master 250 words' },
            { id: 'words_500', icon: '🏅', title: 'Half a Thousand', desc: 'Master 500 words' },
            { id: 'words_1000', icon: '🥇', title: 'Word Machine', desc: 'Master 1000 words' },
            { id: 'words_1500', icon: '👑', title: 'Almost There', desc: 'Master 1500 words' },
            { id: 'words_all', icon: '🏆', title: 'Total Mastery', desc: 'Master all words' },
            { id: 'level_5', icon: '⬆️', title: 'Rising', desc: 'Reach level 5' },
            { id: 'level_10', icon: '🚀', title: 'Liftoff', desc: 'Reach level 10' },
            { id: 'level_20', icon: '🛸', title: 'Orbit', desc: 'Reach level 20' },
            { id: 'level_50', icon: '🌟', title: 'Supernova', desc: 'Reach level 50' },
            { id: 'speed_demon', icon: '⚡', title: 'Speed Demon', desc: 'Answer 10 in under 2s each' },
            { id: 'accuracy_90', icon: '🎯', title: 'Sharpshooter', desc: 'Get 90%+ accuracy (50+ answers)' },
            { id: 'hour_1', icon: '⏰', title: 'First Hour', desc: 'Practice for 1 hour total' },
            { id: 'hour_4', icon: '📚', title: 'Study Session', desc: 'Practice for 4 hours total' },
            { id: 'hour_8', icon: '💪', title: 'Marathon', desc: 'Practice for 8 hours total' },
            { id: 'combo_10', icon: '🔗', title: 'Chain Reaction', desc: 'Get a 10x combo' },
            { id: 'combo_20', icon: '⛓️', title: 'Unbreakable', desc: 'Get a 20x combo' },
            { id: 'night_owl', icon: '🦉', title: 'Night Owl', desc: 'Practice after midnight' },
            { id: 'early_bird', icon: '🐦', title: 'Early Bird', desc: 'Practice before 7am' },
            { id: 'sentence_10', icon: '💬', title: 'Conversational', desc: 'Complete 10 sentence exercises' },
            { id: 'perfect_round', icon: '💎', title: 'Flawless', desc: 'Complete a full round with no mistakes' },
        ];
    },

    unlock(id) {
        if (this.unlockedAchievements.has(id)) return;
        this.unlockedAchievements.add(id);
        const ach = this.achievements.find(a => a.id === id);
        if (!ach) return;
        this.sfxAchievement();
        // Show achievement popup
        const el = document.createElement('div');
        el.className = 'achievement-popup';
        el.innerHTML = `
            <div class="ach-icon">${ach.icon}</div>
            <div class="ach-info">
                <div class="ach-unlocked">Achievement Unlocked!</div>
                <div class="ach-title">${ach.title}</div>
                <div class="ach-desc">${ach.desc}</div>
            </div>
        `;
        document.body.appendChild(el);
        setTimeout(() => el.classList.add('show'), 50);
        setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 500); }, 3500);
        this.renderAchievementCount();
        this.saveState();
    },

    checkAchievements(stats) {
        const { streak, mastered, totalCorrect, totalAttempts, combo, level, sentencesDone, roundPerfect } = stats;
        if (totalCorrect >= 1) this.unlock('first_word');
        if (streak >= 5) this.unlock('streak_5');
        if (streak >= 10) this.unlock('streak_10');
        if (streak >= 25) this.unlock('streak_25');
        if (streak >= 50) this.unlock('streak_50');
        if (mastered >= 10) this.unlock('words_10');
        if (mastered >= 50) this.unlock('words_50');
        if (mastered >= 100) this.unlock('words_100');
        if (mastered >= 250) this.unlock('words_250');
        if (mastered >= 500) this.unlock('words_500');
        if (mastered >= 1000) this.unlock('words_1000');
        if (mastered >= 1500) this.unlock('words_1500');
        if (level >= 5) this.unlock('level_5');
        if (level >= 10) this.unlock('level_10');
        if (level >= 20) this.unlock('level_20');
        if (level >= 50) this.unlock('level_50');
        if (combo >= 10) this.unlock('combo_10');
        if (combo >= 20) this.unlock('combo_20');
        if (totalAttempts >= 50 && totalCorrect / totalAttempts >= 0.9) this.unlock('accuracy_90');
        if (sentencesDone >= 10) this.unlock('sentence_10');
        if (roundPerfect) this.unlock('perfect_round');
        const hour = new Date().getHours();
        if (hour >= 0 && hour < 5) this.unlock('night_owl');
        if (hour >= 5 && hour < 7) this.unlock('early_bird');
    },

    renderAchievementCount() {
        const el = document.getElementById('achievement-count');
        if (el) el.textContent = `${this.unlockedAchievements.size}/${this.achievements.length}`;
    },

    // ===== XP BAR RENDERING =====
    renderXPBar() {
        const bar = document.getElementById('xp-fill');
        const label = document.getElementById('xp-label');
        const levelEl = document.getElementById('level-display');
        if (!bar) return;
        const needed = this.xpForLevel(this.level);
        const pct = Math.min(100, Math.round((this.xp / needed) * 100));
        bar.style.width = pct + '%';
        if (label) label.textContent = `${this.xp} / ${needed} XP`;
        if (levelEl) levelEl.textContent = this.level;
    },

    // ===== SPEED ROUND =====
    speedRoundActive: false,
    speedTimeLeft: 0,
    speedInterval: null,
    speedScore: 0,
    speedCorrect: 0,

    startSpeedRound(durationSec) {
        this.speedRoundActive = true;
        this.speedTimeLeft = durationSec;
        this.speedScore = 0;
        this.speedCorrect = 0;
        const timerEl = document.getElementById('speed-timer');
        const scoreEl = document.getElementById('speed-score');
        const container = document.getElementById('speed-hud');
        if (container) container.style.display = 'flex';
        if (timerEl) timerEl.textContent = this.speedTimeLeft;
        if (scoreEl) scoreEl.textContent = '0';

        this.speedInterval = setInterval(() => {
            this.speedTimeLeft--;
            if (timerEl) timerEl.textContent = this.speedTimeLeft;
            if (this.speedTimeLeft <= 5) this.sfxTick();
            if (this.speedTimeLeft <= 0) {
                this.endSpeedRound();
            }
        }, 1000);
    },

    endSpeedRound() {
        this.speedRoundActive = false;
        clearInterval(this.speedInterval);
        const container = document.getElementById('speed-hud');
        if (container) container.style.display = 'none';
        // Show results
        this.sfxLevelUp();
        const overlay = document.createElement('div');
        overlay.className = 'levelup-overlay';
        overlay.innerHTML = `
            <div class="levelup-content">
                <div class="levelup-stars">⚡</div>
                <div class="levelup-title">SPEED ROUND COMPLETE!</div>
                <div class="levelup-level">${this.speedScore}</div>
                <div class="levelup-subtitle">${this.speedCorrect} correct answers</div>
            </div>
        `;
        document.body.appendChild(overlay);
        setTimeout(() => overlay.classList.add('show'), 50);
        setTimeout(() => { overlay.classList.remove('show'); setTimeout(() => overlay.remove(), 400); }, 3000);
    },

    addSpeedPoints(pts) {
        this.speedScore += pts;
        this.speedCorrect++;
        const el = document.getElementById('speed-score');
        if (el) el.textContent = this.speedScore;
    },

    // ===== PERSISTENCE =====
    saveState() {
        try {
            localStorage.setItem('parlez_gamify', JSON.stringify({
                xp: this.xp, level: this.level,
                unlockedAchievements: [...this.unlockedAchievements],
                dailyGoals: this.dailyGoals,
                totalPracticeMinutes: this.totalPracticeMinutes || 0,
                sentencesDone: this.sentencesDone || 0,
            }));
        } catch(e) {}
    },

    loadState() {
        try {
            const data = localStorage.getItem('parlez_gamify');
            if (data) {
                const s = JSON.parse(data);
                this.xp = s.xp || 0;
                this.level = s.level || 1;
                this.unlockedAchievements = new Set(s.unlockedAchievements || []);
                this.dailyGoals = s.dailyGoals || this.dailyGoals;
                this.totalPracticeMinutes = s.totalPracticeMinutes || 0;
                this.sentencesDone = s.sentencesDone || 0;
            }
        } catch(e) {}
    },

    totalPracticeMinutes: 0,
    sentencesDone: 0,
};
