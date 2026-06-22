let canvas, textbox, gl, shader, batcher, assetManager, skeletonRenderer;
let mvp = new spine.webgl.Matrix4();

let lastFrameTime;
let spineDataA, spineDataBG;
let bufferColor = [ 0.3, 0.3, 0.3 ];

const CHARACTER = 'arona_spr';
const BINARY_PATH = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${CHARACTER}.skel`) : `./assets/${CHARACTER}.skel`;
const ATLAS_PATH = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${CHARACTER}.atlas`) : `./assets/${CHARACTER}.atlas`;
const CHARACTER_2 = 'NP0035_spr';
const BINARY_PATH_2 = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${CHARACTER_2}.skel`) : `./assets/${CHARACTER_2}.skel`;
const ATLAS_PATH_2 = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${CHARACTER_2}.atlas`) : `./assets/${CHARACTER_2}.atlas`;
const BG_DAY = 'arona_workpage_daytime';
const BINARY_PATH_BG_DAY = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${BG_DAY}.skel`) : `./assets/${BG_DAY}.skel`;
const ATLAS_PATH_BG_DAY = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${BG_DAY}.atlas`) : `./assets/${BG_DAY}.atlas`;
const BG_NIGHT = 'arona_workpage_nighttime';
const BINARY_PATH_BG_NIGHT = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${BG_NIGHT}.skel`) : `./assets/${BG_NIGHT}.skel`;
const ATLAS_PATH_BG_NIGHT = window.location.protocol === 'file:' ? location.href.replace('/index.html', `/assets/${BG_NIGHT}.atlas`) : `./assets/${BG_NIGHT}.atlas`;

const LOADOUT = { isday: true, isorganized: false, start: 0, start2: 0, introAudio: null, startAudio: null, interactAudio: null, ux: 0, uy: 0 };

let customScale = 1;
let targetFps = 30;
let bgmfile = '';
let bgmvolume = 0;
let bgm;
let voiceAudio = null;
let oldAudio = false;

let alerted = false;
let globalPause = false;

let introAnimation, spoilerChar;
let forcedTime = -1;
let acceptingClick;
let characterOffset = { x: -720, y: 0 };
let introLoop;
let introTrack, sideTrack;
let currentVoiceline = 1;
let mouseSelect = -1;
let trackerID = -1;
let untrackerID = -1;
let unpetID = -1;
let PPointX, PPointY, EPointX, EPointY;
let TPoint, TEye;
let flipped = false;
let displayDialog = false;
let enableIdleLines = false;

let transpose = 1;

// All voicelines are manually timed for duration. This may not be the most optimized solution, but works for all intents and purposes.
const SPOILER_INTRO_AUDIO = [
	{
		text_location: { a: { x: 750, y: 500 }, p: { x: 1100, y: 550 } },
		in: [ 'NP0035/np0035_work_aronasleepsit_in_1_2', 'NP0035/np0035_work_aronasleepsit_in_2_2' ],
		in_dialog: [ "草莓牛奶……？", "前辈，好像该起床了……" ],
		in_speaker: [ "p", "p" ]
	},
	{
		text_location: { a: { x: 750, y: 500 }, p: { x: 1000, y: 300 } },
		in: [ 'NP0035/np0035_work_aronasleeppeek_in_1_2', 'NP0035/np0035_work_aronasleeppeek_in_2_2' ],
		in_dialog: [ "在睡觉吗……", "果然在睡觉……" ],
		in_speaker: [ "p", "p" ]
	},
	{
		text_location: { a: { x: 750, y: 500 }, p: { x: 1100, y: 550 } },
		in: [ 'NP0035/np0035_work_aronasleepsit_talk_4_2' ],
		in_dialog: [ "真的吗……？?" ],
		in_speaker: [ "p" ]
	}
]

const INTRO_AUDIO_A = [
	{
		text_location: { a: { x: 680, y: 860 }, p: { x: 0, y: 0 } },
		exit: [ 'Arona/arona_work_sleep_exit_1', 'Arona/arona_work_sleep_exit_2', 'Arona/arona_work_sleep_exit_3' ],
		exit_dialog: [ "嗯，呀？", "啊呀？！", "……咿？！" ],
		exit_speaker: [ "a", "a", "a" ],
		in: [ 'Arona/arona_work_sleep_in_1', 'Arona/arona_work_sleep_in_2' ],
		in_dialog: [ "唔，草莓牛奶…… 嘿嘿嘿。", "我次不下那么多了……" ],
		in_speaker: [ "a", "a" ],
		talk: [ 'Arona/arona_work_sleep_talk_1', 'Arona/arona_work_sleep_talk_2', 'Arona/arona_work_sleep_talk_3', 'Arona/arona_work_sleep_talk_4', 'Arona/arona_work_sleep_talk_5', 'Arona/arona_work_sleep_talk_6' ],
		talk_dialog: [ "……唔嘿，老师你真是的~", "……唔嘿嘿嘿嘿。", "唔唔。", "我才没有打瞌睡呢……唔唔。", "唔嘻，喵……", "老师，请你正经点……" ],
		talk_speaker: [ "a", "a", "a", "a", "a", "a" ]
	},
	{
		text_location: { a: { x: 1000, y: 350 }, p: { x: 0, y: 0 } },
		exit: [ 'Arona/arona_work_watch_exit_1', 'Arona/arona_work_watch_exit_2' ],
		exit_dialog: [ "啊！", "咦？" ],
		exit_speaker: [ "a", "a" ],
		in: [ 'Arona/arona_work_watch_in_1', 'Arona/arona_work_watch_in_2' ],
		in_dialog: [ "嗯，不错！ 今天也是个好天气。", "唔……是不是要下雨啊。" ],
		in_speaker: [ "a", "a" ],
		talk: [ 'Arona/arona_work_watch_talk_1', 'Arona/arona_work_watch_talk_3' ],
		talk_dialog: [ "天空真是广袤。另一边会有些什么呢……", "……" ],
		talk_speaker: [ "a", "a" ]
	},
	{
		text_location: { a: { x: 750, y: 500 }, p: { x: 0, y: 0 } },
		exit: [ 'Arona/arona_work_sit_exit_1', 'Arona/arona_work_sit_exit_2', 'Arona/arona_work_sit_exit_3' ],
		exit_dialog: [ "啊？", "咦？", "啊！" ],
		exit_speaker: [ "a", "a", "a" ],
		in: [ 'Arona/arona_work_sit_in_1' ],
		in_dialog: [ "啦啦~♬" ],
		in_speaker: [ "a" ],
		talk: [ 'Arona/arona_work_sit_talk_1', 'Arona/arona_work_sit_talk_2', 'Arona/arona_work_sit_talk_3' ],
		talk_dialog: [ "啦啦啦啦啦♪", "哼哼哼~♩", "今天又会♬有什么事情♬在等着我呢~♪" ],
		talk_speaker: [ "a", "a", "a" ]
	}
];

const INTRO_STARTWORK_A = {
	talk: [ [ 'Arona/arona_default_tts', 'Arona/arona_work_in_1'] , 'Arona/arona_work_in_2', 'Arona/arona_work_in_3', 'Arona/arona_work_in_4' ],
	expression: [ [ '12', '12' ], '25', '31', '32' ],
	talk_dialog: [ [ "老师！我等您很久啦！", "老师！我等您很久啦！" ], "来，该处理工作了！", "您想先从哪件事开始做起呢，老师？", "我会帮老师一起处理工作的！" ],
};

const INTERACT_AUDIO_A = {
	talk: [ 'Arona/arona_work_talk_1', [ 'Arona/arona_default_tts', 'Arona/arona_work_talk_2' ], 'Arona/arona_work_talk_3', 'Arona/arona_work_talk_4', 'Arona/arona_work_talk_5', 'Arona/arona_work_talk_6', 'Arona/arona_work_talk_7_1' ],
	talk_dialog: [ "老师可以在这里处理各种工作哦！", [ "老师！选择您想处理的工作吧。我会在一旁帮您的！", "老师！选择您想处理的工作吧。我会在一旁帮您的！" ], "还有那么多工作要处理啊。 大人可真辛苦。", "还有很多事情需要处理哦。 加油吧！", "偶尔也要为自己的健康着想哦。 老师，我会很担心的！", "呜哇哇……还有这么多工作需要处理啊。", "来，加油吧！ 老师！" ],
	expression: [ '00', [ '25', '25' ], '13', '12', '18', '29', '25' ]
};

const INTRO_AUDIO_P = [
	{
		text_location: { a: { x: 0, y: 0 }, p: { x: 450, y: 300 } },
		exit: [ 'NP0035/np0035_work_cabinet_exit_1' ],
		exit_dialog: [ "……啊。" ],
		exit_speaker: [ "p" ],
		in: [ 'NP0035/np0035_work_cabinet_in_1', 'NP0035/np0035_work_cabinet_in_2' ],
		in_dialog: [ "这个地方……是这样吗？", "……是这样啊。" ],
		in_speaker: [ "p", "p" ],
		talk: [ 'NP0035/np0035_work_cabinet_talk_1', 'NP0035/np0035_work_cabinet_talk_1' ],
		talk_dialog: [ "嗯……果然如此。", "呃……是这样的结构啊。" ],
		talk_speaker: [ "p", "p" ]
	},
	{
		text_location: { a: { x: 750, y: 500 }, p: { x: 1100, y: 550 } },
		exit: [ 'NP0035/np0035_work_sit_exit_1' ],
		exit_dialog: [ "啊。" ],
		exit_speaker: [ "p" ],
		in: [ 'NP0035/np0035_work_sit_in_1' , 'NP0035/np0035_work_sit_in_2' ],
		in_dialog: [ "嗯……", "唔……" ],
		in_speaker: [ "p", "p" ],
		talk: [ 'NP0035/np0035_work_sit_talk_1' ],
		talk_dialog: [ "……" ],
		talk_speaker: [ "p" ]
	},
	{
		text_location: { a: { x: 575, y: 125 }, p: { x: 1300, y: 350 } },
		exit: [ 'NP0035/np0035_work_umbrella_exit_1' ],
		exit_dialog: [ "啊。" ],
		exit_speaker: [ "p" ],
		in: [ 'NP0035/np0035_work_umbrella_in_1' ],
		in_dialog: [ "下雨的话就用这个……" ],
		in_speaker: [ "p" ],
		talk: [ 'NP0035/np0035_work_umbrella_talk_1', 'NP0035/np0035_work_umbrella_talk_2' ],
		talk_dialog: [ "应该有用吧……？", "我也……一起……" ],
		talk_speaker: [ "p", "p" ]
	},
	{
		text_location: { a: { x: 1600, y: 400 }, p: { x: 1250, y: 180 } },
		exit: [ 'NP0035/np0035_work_planawatchsky_exit_1' ],
		exit_dialog: [ "……啊。" ],
		exit_speaker: [ "p" ],
		in: [ [ 'Arona/arona_work_planawatchsky_in_1_1', 'NP0035/np0035_work_planawatchsky_in_1_2', 'Arona/arona_work_planawatchsky_in_1_3' ] ],
		in_dialog: [ [ "看到那个了吗？小普拉娜？", "是说那个吗，前辈？", "对！就是那个！" ] ],
		in_speaker: [ [ "a", "p", "a" ] ],
		talk: [ [ 'Arona/arona_work_planawatchsky_talk_1_1', 'NP0035/np0035_work_planawatchsky_talk_1_2' ] ],
		talk_dialog: [ [ "那边怎么样？", "嗯……" ] ],
		talk_speaker: [ [ "a", "p" ] ]
	},
	{
		text_location: { a: { x: 1500, y: 350 }, p: { x: 1100, y: 550 } },
		exit: [ 'NP0035/np0035_planasitpeek_exit_1' ],
		exit_dialog: [ "啊。" ],
		exit_speaker: [ "p" ],
		in: [ [ 'Arona/arona_work_planasitpeek_in_1_1' , 'NP0035/np0035_work_planasitpeek_in_1_2' ] ],
		in_dialog: [ [ "盯——", "唔……" ] ],
		in_speaker: [ [ "a", "p" ] ],
		talk: [ 'NP0035/np0035_work_planasitpeek_talk_1', 'NP0035/np0035_work_planasitpeek_talk_2' ],
		talk_dialog: [ "……我感觉到有人在注视我。", "……有点为难。" ],
		talk_speaker: [ "p", "p" ]
	}
];

const INTRO_STARTWORK_P = {
	talk: [ [ 'NP0035/np0035_work_in_1_1', 'NP0035/np0035_default_tts', 'NP0035/np0035_work_in_1_2' ], 'NP0035/np0035_work_in_2', 'NP0035/np0035_work_in_3', 'NP0035/np0035_work_in_4' ],
	expression: [ [ '02', '03', '03' ], '03', '00', '02' ],
	talk_dialog: [ [ "确认连接。", "老师，等您很久了。", "老师，等您很久了。" ], "该工作了。", "您要做哪些工作呢，老师？", "正在待命。需要解决的任务还有很多。" ],
};

const INTERACT_AUDIO_P = {
	talk: [ 'NP0035/np0035_work_talk_1', [ 'NP0035/np0035_default_tts', 'NP0035/np0035_work_talk_2' ], 'NP0035/np0035_work_talk_3', 'NP0035/np0035_work_talk_4', 'NP0035/np0035_work_talk_5' ],
	talk_dialog: [ "老师可以在这里处理各种各样的工作。", [ "老师，请选择您需要执行的工作。", "老师，请选择您需要执行的工作。" ] , "这些是需要解决的工作。那就拜托您了。", "混乱，该行动无法理解。请不要戳我，会出现故障。", "我明白了。老师现在无事可做，很无聊。" ],
	expression: [ '03', [ '03', '03' ], '03', '13', '12' ]
};

const HITBOX = {
	headpat: { xMin: 1320, xMax: 1630, yMin: 615, yMax: 755 },
	voiceline: { xMin: 1300, xMax: 1550, yMin: 970, yMax: 1450 }
};

const HEADPAT_CLAMP = 30;
const EYE_CLAMP_X = 200;
const EYE_CLAMP_Y = EYE_CLAMP_X * (9 / 16)
const HEADPAT_STEP = 5;
const EYE_STEP = 10;
let mousePos = { x: 0, y: 0 };
let volume = 0.3;
let volumeMem = 0.3;
let mouseOptions = { voicelines: true, headpatting: true, mousetracking: true, autotrack: true };

function clamp(num, min, max) {
	return Math.min(Math.max(num, min), max);
}

function idleLines() {
	if (globalPause) return;

	if (!LOADOUT.isday && LOADOUT.start == 1 && LOADOUT.start2 == 1) LOADOUT.start = 4;
	let array = LOADOUT.introAudio[LOADOUT.start];
	let selection = Math.floor(Math.random() * array.talk.length);
	introTrack = playLine(
		{ filepath: array.talk[selection], dialog: array.talk_dialog[selection], dPositions: array.text_location, dSequence: array.talk_speaker[selection] }
	);
	if (spoilerChar && LOADOUT.isday && LOADOUT.start == 0 && LOADOUT.start2 == 0 && selection == 3) {
		introTrack.addEventListener('ended', function() {
			setTimeout(function() {
				sideTrack = playLine(
					{ filepath: SPOILER_INTRO_AUDIO[2].in[0], dialog: SPOILER_INTRO_AUDIO[2].in_dialog[0], dPositions: SPOILER_INTRO_AUDIO[2].text_location, dSequence: SPOILER_INTRO_AUDIO[2].talk_speaker[0] }
				)
			}, 500);
		});
	}
	if (spoilerChar && LOADOUT.isday && LOADOUT.start == 0 && LOADOUT.start2 == 0 && selection == 3) {
		introTrack.addEventListener('ended', function() {
			setTimeout(function() {
				sideTrack = playLine(
					{ filepath: SPOILER_INTRO_AUDIO[2].in[0], dialog: SPOILER_INTRO_AUDIO[2].in_dialog[0], dPositions: SPOILER_INTRO_AUDIO[2].text_location, dSequence: SPOILER_INTRO_AUDIO[2].talk_speaker[0] }
				)
			}, 500);
		});
	}
}

// NOTE: X and Y appears to be inversely related from cursor position to bone adjustment.
//       This behavior's reason is unknown, but it LOOKS right so leave it alone!
function trackMouse() {
	let adjX = (mousePos.x / canvas.clientWidth) - 0.5 - (characterOffset.x / (2880 * 2));
	let adjY = (mousePos.y / canvas.clientHeight) - 0.5 - (characterOffset.y / (1620 * 2));
	TEye.y = TEye.y - (Math.sign(adjX) * EYE_STEP);
	TEye.x = TEye.x - (Math.sign(adjY) * EYE_STEP);
	TEye.y = clamp(TEye.y, EPointY - (Math.abs(adjX) * EYE_CLAMP_X), EPointY + (Math.abs(adjX) * EYE_CLAMP_X));
	TEye.x = clamp(TEye.x, EPointX - (Math.abs(adjY) * EYE_CLAMP_Y), EPointX + (Math.abs(adjY) * EYE_CLAMP_Y));
}

function untrackMouse() {
	if (Math.abs(TEye.y - EPointY) <= EYE_STEP && Math.abs(TEye.x - EPointX) <= EYE_STEP) {
		if (untrackerID != -1) {
			TEye.y = EPointY;
			TEye.x = EPointX;
			clearInterval(untrackerID);
			untrackerID = -1;
			setTimeout(function (){
				acceptingClick = true;
			}, 500);
		}
	}
	if (TEye.y > EPointY) TEye.y -= EYE_STEP;
	if (TEye.y < EPointY) TEye.y += EYE_STEP;
	if (TEye.x > EPointX) TEye.x -= EYE_STEP;
	if (TEye.x < EPointX) TEye.x += EYE_STEP;
}

function unpet() {
	if (Math.abs(TPoint.x - PPointX) <= HEADPAT_STEP && Math.abs(TPoint.y - PPointY) <= HEADPAT_STEP) {
		if (unpetID != -1) {
			TPoint.x = PPointX;
			TPoint.y = PPointY;
			clearInterval(unpetID);
			unpetID = -1;
			setTimeout(function() {
				acceptingClick = true;
			}, 500);
		}
	}
	if (TPoint.y > PPointY) TPoint.y -= HEADPAT_STEP;
	if (TPoint.y < PPointY) TPoint.y += HEADPAT_STEP;
	if (TPoint.x > PPointX) TPoint.x -= HEADPAT_STEP;
	if (TPoint.x < PPointX) TPoint.x += HEADPAT_STEP;
}

function playLine(voiceData, endFunc, spine) {
	let audioDir = oldAudio ? 'oldAudio' : 'audio';
	let parentTrack;
	if (typeof(voiceData.filepath) == 'string') {
		let track = new Audio(`./assets/${audioDir}/${voiceData.filepath}.m4a`);
		if (voiceData.expression && spine) spine.state.setAnimation(1, voiceData.expression, true);
		track.volume = volume;
		track.play();

		if (voiceData.dPositions && LOADOUT.isorganized) {
			textbox.style.left = tInvert(voiceData.dPositions[voiceData.dSequence].x, 'x') + 'px';
			textbox.style.top = tInvert(voiceData.dPositions[voiceData.dSequence].y, 'y') + 'px';
		}
		else {
			textbox.style.left = LOADOUT.ux + '%';
			textbox.style.top = LOADOUT.uy + '%';
		}
		textbox.innerHTML = voiceData.dialog;
		if (displayDialog) textbox.style.opacity = 1;

		function onLineEnd() {
			if (track._lineDone) return;
			track._lineDone = true;
			textbox.style.opacity = 0;
			voiceAudio = null;
			if (endFunc) endFunc();
		}
		track.addEventListener('ended', onLineEnd);
		track.addEventListener('error', function() { onLineEnd(); });
		setTimeout(function() { onLineEnd(); }, 30000);

		parentTrack = track;
	}
	else {
		let prevtrack;
		for (let i = 1; i <= voiceData.filepath.length; i++) {
			let track = new Audio(`./assets/${audioDir}/${voiceData.filepath[i - 1]}.m4a`);
			if (i == 1) {
				parentTrack = track;
			}
			track.volume = volume;
			if (!prevtrack) {
				if (voiceData.dPositions && LOADOUT.isorganized) {
					textbox.style.left = tInvert(voiceData.dPositions[voiceData.dSequence[i - 1]].x, 'x') + 'px';
					textbox.style.top = tInvert(voiceData.dPositions[voiceData.dSequence[i - 1]].y, 'y') + 'px';
				}
				else {
					textbox.style.left = LOADOUT.ux + '%';
					textbox.style.top = LOADOUT.uy + '%';
				}
				if (voiceData.expression && voiceData.expression[i - 1] && spine) spine.state.setAnimation(1, voiceData.expression[i - 1], true);
				track.play();
				textbox.innerHTML = voiceData.dialog[i - 1];
				if (displayDialog) textbox.style.opacity = 1;
				prevtrack = track;
			}
			else {
				prevtrack.addEventListener('ended', function() {
					if (voiceData.expression && voiceData.expression[i - 1] && spine) spine.state.setAnimation(1, voiceData.expression[i - 1], true);
					if (voiceData.dPositions && LOADOUT.isorganized) {
						textbox.style.left = tInvert(voiceData.dPositions[voiceData.dSequence[i - 1]].x, 'x') + 'px';
						textbox.style.top = tInvert(voiceData.dPositions[voiceData.dSequence[i - 1]].y, 'y') + 'px';
					}
					else {
						textbox.style.left = LOADOUT.ux + '%';
						textbox.style.top = LOADOUT.uy + '%';
					}
					track.play();
					textbox.innerHTML = voiceData.dialog[i - 1];

					introTrack = track;
				});

				prevtrack = track;
			}
			if (i == voiceData.filepath.length) {
				track.addEventListener('ended', function() {
					textbox.style.opacity = 0;
					voiceAudio = null;
					endFunc();
				});
			}
		}
	}

	return parentTrack;
}

// Textbox Position Scaling (inverse of Hitbox Scaling)
function tInvert(n, side) {
	let d = { x: { length: 2880, mid: (canvas.clientWidth / 2) }, y: { length: 1620, mid: (canvas.clientHeight / 2) } }
	n = n - (d[side].length * 0.5);
	n = (n / transpose) * customScale;
	return (n + d[side].mid);
}

// Hitbox Scaling
function t(n, side) {
	let d = { x: { length: 2880, mid: (canvas.clientWidth / 2) }, y: { length: 1620, mid: (canvas.clientHeight / 2) } }
	n = n - d[side].mid;
	n = (n * transpose) / customScale;
	return ((d[side].length * 0.5) + n);
}

// -1 = [No Entry], 1 = Headpat, 2 = Voiceline, 3 = Eye Track
function pressedMouse(x, y, overrideTrack = false) {
	tx = t(x, 'x');
	ty = t(y, 'y');
	console.log('[Arona] pressedMouse', { alerted, tx, ty, acceptingClick, mouseSelect });
	if (!alerted && tx < 1440) {
		console.log('[Arona] WAKE triggered!');
		if (introLoop) {
			clearInterval(introLoop);
			introLoop = null;
		}
		if (introTrack) {
			introTrack.pause();
			introTrack = null;
		}
		if (sideTrack) {
			sideTrack.pause();
			sideTrack = null;
		}

		spineDataBG.state.addAnimation(2, `Idle_0${LOADOUT.start}_Touch_M`, false, 0);
		spineDataBG.state.addAnimation(3, `Idle_0${LOADOUT.start}_Touch_A`, false, 0);

		if (LOADOUT.isday && LOADOUT.start == 0 && spoilerChar) {
			spineDataBG.state.addAnimation(5, `Idle_1${(LOADOUT.start2 + 1)}_Touch_M`, false, 0);
			spineDataBG.state.addAnimation(6, `Idle_1${(LOADOUT.start2 + 1)}_Touch_A`, false, 0);
		}

		if (!LOADOUT.isday && LOADOUT.start == 1 && LOADOUT.start2 == 1) {
			spineDataBG.state.addAnimation(5, 'Idle_11_Touch_M', false, 0);
			spineDataBG.state.addAnimation(6, 'Idle_11_Touch_A', false, 0);
		}

		let array = LOADOUT.introAudio[LOADOUT.start];
		let selection = Math.floor(Math.random() * array.exit.length);
		let track = new Audio(`./assets/audio/${array.exit[selection]}.m4a`);
		track.volume = volume;
		track.play();
		if (array.text_location && LOADOUT.isorganized) {
			textbox.style.left = tInvert(array.text_location[array.exit_speaker[selection]].x, 'x') + 'px';
			textbox.style.top = tInvert(array.text_location[array.exit_speaker[selection]].y, 'y') + 'px';
		}
		else {
			textbox.style.left = LOADOUT.ux + '%';
			textbox.style.top = LOADOUT.uy + '%';
		}
		textbox.innerHTML = array.exit_dialog[selection];
		if (displayDialog) textbox.style.opacity = 1;
		function finishWake() {
			if (track._wakeDone) return;
			track._wakeDone = true;
			spineDataBG.state.setAnimation(0, 'Idle_background_00', true);
			spineDataBG.state.setEmptyAnimation(1, 0);
			spineDataBG.state.setEmptyAnimation(2, 0);
			spineDataBG.state.setEmptyAnimation(3, 0);
			spineDataBG.state.setEmptyAnimation(4, 0);
			spineDataBG.state.setEmptyAnimation(5, 0);
			spineDataBG.state.setEmptyAnimation(6, 0);
			textbox.style.opacity = 0;
			voiceAudio = null;

			setTimeout(function() {
				alerted = true;
				spineDataA.state.setAnimation(0, 'Idle_01', true);
				let selection = Math.floor(Math.random() * 4);
				voiceAudio = playLine(
					{ filepath: LOADOUT.startAudio.talk[selection], dialog: LOADOUT.startAudio.talk_dialog[selection], expression: LOADOUT.startAudio.expression[selection] },
					function() {
						spineDataA.state.setAnimation(1, '00', true);
						acceptingClick = true;
					},
					spineDataA
				)
			}, 500);
		}
		track.addEventListener('ended', finishWake);
		track.addEventListener('error', function() {
			console.warn('[Arona] Audio failed, waking up anyway');
			finishWake();
		});
		// Safety: if audio stalls for 8s, wake up anyway
		setTimeout(function() { finishWake(); }, 8000);

		voiceAudio = track;
	}
	else if (!overrideTrack && mouseSelect <= 0 && tx > (HITBOX.headpat.xMin + characterOffset.x) && tx < (HITBOX.headpat.xMax + characterOffset.x) && ty > (HITBOX.headpat.yMin - characterOffset.y) && ty < (HITBOX.headpat.yMax - characterOffset.y) && mouseOptions.headpatting) {
		spineDataA.state.setAnimation(1, 'Pat_01_M', false);
		spineDataA.state.setAnimation(2, 'Pat_01_A', false);
		mouseSelect = 1;
	}
	else if (!overrideTrack && mouseSelect <= 0 && tx > (HITBOX.voiceline.xMin + characterOffset.x) && tx < (HITBOX.voiceline.xMax + characterOffset.x) && ty > (HITBOX.voiceline.yMin - characterOffset.y) && ty < (HITBOX.voiceline.yMax - characterOffset.y) && mouseOptions.voicelines) {
		mouseSelect = 2;
	}
	else if (mouseOptions.mousetracking) {
		if (trackerID == -1) {
			trackerID = setInterval(trackMouse, 20);
		}
		spineDataA.state.setEmptyAnimation(1, 0);
		spineDataA.state.setEmptyAnimation(2, 0);
		let eyetracking = spineDataA.state.addAnimation(1, 'Look_01_M', false, 0);
		eyetracking.mixDuration = 0.2;
		if (LOADOUT.isday) {
			let eyetracking2 = spineDataA.state.addAnimation(2, 'Look_01_A', false, 0);
			eyetracking2.mixDuration = 0.2;
		}
		mousePos.x = x;
		mousePos.y = y;
		mouseSelect = 3;
	}
	else if (mouseSelect == -1) {
		acceptingClick = true;
	}
}

let idleMovement = 0;
let idleTimeout = -1;
let idleMax = 30; //expressed in 100ms/unit = 3s before auto-track stops
let minMovement = 5;

function autoTimeout() {
	idleMovement = idleMovement + 1;
	if (idleMovement >= idleMax && idleTimeout != -1) {
		clearInterval(idleTimeout);
		idleTimeout = -1;
		releasedMouse(0, 0);

		// Will not auto-track again until 3 seconds have passed since last tracking
		setTimeout(function() {
			idleMovement = 0;
		}, 3000);
	}
}

function movedMouse(x, y, deltaX, deltaY) {
	let v = Math.sqrt((deltaX * deltaX) + (deltaY * deltaY)) > minMovement;
	if (mouseOptions.autotrack && mouseSelect <= 0 && v && acceptingClick && alerted && idleMovement <= 0) {
		mouseSelect = 3;
		pressedMouse(x, y, true);
		acceptingClick = false;
		idleTimeout = setInterval(autoTimeout, 100);
	}
	switch (mouseSelect) {
		case 1:
			if ((y < 810 && deltaY < 0) || (x >= 1440 && deltaX > 0)) {
				TPoint.y = clamp(TPoint.y - HEADPAT_STEP, PPointY - HEADPAT_CLAMP, PPointY + HEADPAT_CLAMP);
			}
			else if ((y >= 810 && deltaY > 0) || (x < 1440 && deltaX < 0)) {
				TPoint.y = clamp(TPoint.y + HEADPAT_STEP, PPointY - HEADPAT_CLAMP, PPointY + HEADPAT_CLAMP);
			}
			break;
		case 2:
			mouseSelect = -1;
			acceptingClick = true;
			break;
		case 3:
			mousePos.x = x;
			mousePos.y = y;
			if (v) idleMovement = 0;
			break;
		default:
	}
}

function releasedMouse(x, y) {
	switch (mouseSelect) {
		case 1:
			if (unpetID == -1) {
				unpetID = setInterval(unpet, 20);
			}
			spineDataA.state.setAnimation(1, 'PatEnd_01_M', false);
			spineDataA.state.setAnimation(2, 'PatEnd_01_A', false);
			spineDataA.state.addEmptyAnimation(1, 0.5, 0);
			spineDataA.state.addEmptyAnimation(2, 0.5, 0);
			break;
		case 2:
			let selection = Math.floor(Math.random() * LOADOUT.interactAudio.talk.length);
			voiceAudio = playLine(
				{ filepath: LOADOUT.interactAudio.talk[selection], dialog: LOADOUT.interactAudio.talk_dialog[selection], expression: LOADOUT.interactAudio.expression[selection] },
				function() {
					spineDataA.state.setAnimation(1, '00', true);
					acceptingClick = true;
				},
				spineDataA
			);
			break;
		case 3:
			if (trackerID != -1) {
				clearInterval(trackerID);
				trackerID = -1;
			}
			if (untrackerID == -1) {
				untrackerID = setInterval(untrackMouse, 20);
			}
			let eyetracking = spineDataA.state.setAnimation(1, 'LookEnd_01_M', false);
			let eyetracking2 = spineDataA.state.setAnimation(2, 'LookEnd_01_A', false);
			eyetracking.mixDuration = 0;
			eyetracking2.mixDuration = 0;
			spineDataA.state.addEmptyAnimation(1, 0.5, 0);
			spineDataA.state.addEmptyAnimation(2, 0.5, 0);
			break;
		default:
	}
	mouseSelect = -1;
}

function setMouse(event) {
	let ax = event.clientX;
	let ay = event.clientY;
	let mx = 1;
	if (flipped) {
		mx = -1;
		ax = canvas.clientWidth - ax;
	}

	return { x: ax, y: ay, m: mx }
}

function init() {
	// Wallpaper Engine settings
	window.wallpaperPropertyListener = {
		applyUserProperties: (props) => {
			if (props.schemecolor) {
				bufferColor = props.schemecolor.value.split(" ");
			}
			if (props.alignmentfliph) flipped = props.alignmentfliph.value;
			if (props.scale) {
				customScale = props.scale.value;
				resize();
			}
			if (props.targetfps) targetFps = props.targetfps.value;

			// assigned only on initialization when spoilerChar is [undef] and forcetime & timehr can be passed simultaneously
			if (props.bonuschar && typeof(spoilerChar) == 'undefined') spoilerChar = props.bonuschar.value;
			if (props.timeofday) forcedTime = props.timeofday.value;
			if (props.introanimation) introAnimation = props.introanimation.value;
			if (props.idlelines) {
				enableIdleLines = props.idlelines.value;
				if (!enableIdleLines && introLoop) {
					clearInterval(introLoop);
					introLoop = null;
				}
			}

			if (props.mousetracking) mouseOptions.mousetracking = props.mousetracking.value;
			if (props.headpatting) mouseOptions.headpatting = props.headpatting.value;
			if (props.voicelines) mouseOptions.voicelines = props.voicelines.value;
			if (props.useoldvoices) oldAudio = props.useoldvoices.value;
			if (props.voicevolume) volume = props.voicevolume.value / 100;

			if (props.autotrackmouse) mouseOptions.autotrack = props.autotrackmouse.value;

			if (props.characterx) characterOffset.x = ((props.characterx.value - 50) / 100) * 2880;
			if (props.charactery) characterOffset.y = ((props.charactery.value - 50) / -100) * 1620;
			if (props.showdialog) displayDialog = props.showdialog.value;
			if (props.dialogx) LOADOUT.ux = props.dialogx.value;
			if (props.dialogy) LOADOUT.uy = props.dialogy.value;
			if (props.fixeddialog) LOADOUT.isorganized = props.fixeddialog.value;

			if (props.bgmfile) {
				bgmfile = 'file:///' + props.bgmfile.value.replace("%3A", "\:");
			}
			if (props.bgmvolume) {
				bgmvolume = props.bgmvolume.value / 100;
				if (bgm) bgm.volume = bgmvolume;
			}
		},
		setPaused: function(isPaused) {
			if (isPaused) {
				globalPause = true;
				bgm.pause();
				if (voiceAudio) voiceAudio.volume = 0;
				if (introTrack) introTrack.volume = 0;
				if (sideTrack) sideTrack.volume = 0;
			} else {
				bgm.play();
				globalPause = false;
				if (voiceAudio) voiceAudio.volume = volume;
				if (introTrack) introTrack.volume = volume;
				if (sideTrack) sideTrack.volume = volume;
			}
		}
	};

	// Setup canvas and WebGL context. We pass alpha: false to canvas.getContext() so we don't use premultiplied alpha when
	// loading textures. That is handled separately by PolygonBatcher.

	textbox = document.getElementById('textbox');

	canvas = document.getElementById('canvas');
	canvas.width = 0;
	canvas.height = 0;

	let config = { alpha: false };
	gl = canvas.getContext('webgl', config) || canvas.getContext('experimental-webgl', config);
	if (!gl) {
		alert('WebGL is unavailable.');
		return;
	}

	// Create a simple shader, mesh, model-view-projection matrix, SkeletonRenderer, and AssetManager.
	shader = spine.webgl.Shader.newTwoColoredTextured(gl);
	batcher = new spine.webgl.PolygonBatcher(gl);
	mvp.ortho2d(0, 0, canvas.clientWidth - 1, canvas.clientHeight - 1);
	skeletonRenderer = new spine.webgl.SkeletonRenderer(gl);
	assetManager = new spine.webgl.AssetManager(gl);

    // Tell AssetManager to load the resources for each skeleton, including the exported .skel file, the .atlas file and the .png
	// file for the atlas. We then wait until all resources are loaded in the load() method.
    assetManager.loadBinary(BINARY_PATH);
	assetManager.loadTextureAtlas(ATLAS_PATH);
	assetManager.loadBinary(BINARY_PATH_2);
	assetManager.loadTextureAtlas(ATLAS_PATH_2);
	assetManager.loadBinary(BINARY_PATH_BG_DAY);
	assetManager.loadTextureAtlas(ATLAS_PATH_BG_DAY);
	assetManager.loadBinary(BINARY_PATH_BG_NIGHT);
	assetManager.loadTextureAtlas(ATLAS_PATH_BG_NIGHT);

	requestAnimationFrame(load);
}

// Determine whether to use Plana or not
function loadoutSelect() {
	let t = new Date();
	let hr = t.getHours();
	if(forcedTime == -2) {
		hr = Math.floor(Math.random() * 24);
	}
	else if (forcedTime != -1) {
		hr = forcedTime;
	}

	LOADOUT.isday = !((spoilerChar) && hr < 6 || hr >= 18);
	LOADOUT.start = LOADOUT.isday ? Math.floor(Math.random() * 3) : Math.floor(Math.random() * 4);
	LOADOUT.start2 = Math.floor(Math.random() * 2);
	LOADOUT.introAudio = LOADOUT.isday ? INTRO_AUDIO_A : INTRO_AUDIO_P;
	LOADOUT.startAudio = LOADOUT.isday ? INTRO_STARTWORK_A : INTRO_STARTWORK_P;
	LOADOUT.interactAudio = LOADOUT.isday ? INTERACT_AUDIO_A : INTERACT_AUDIO_P;
}

// CITATION: http://esotericsoftware.com/spine-api-reference#
		console.log('[Arona] interactionLoad - setting up listeners');
// CITATION: http://en.esotericsoftware.com/forum/Spine-Unity-Making-the-arm-follow-the-mouse-7856
function interactionLoad() {
	// Touch_Point and Touch_Eye
	TPoint = spineDataA.skeleton.findBone('Touch_Point');
	TEye = spineDataA.skeleton.findBone('Touch_Eye');
	PPointX = TPoint.x;
	PPointY = TPoint.y;
	EPointX = TEye.x;
	EPointY = TEye.y;

	downaction = canvas.addEventListener('mousedown', function(event) {
		if (!acceptingClick) {
			return;
		}
		acceptingClick = false;
		let mouseData = setMouse(event);
		pressedMouse(mouseData.x, mouseData.y);
	});
	upaction = canvas.addEventListener('mouseup', function(event) {
		let mouseData = setMouse(event);
		releasedMouse(mouseData.x, mouseData.y);
	});
	moveaction = canvas.addEventListener('mousemove', function(event) {
		let mouseData = setMouse(event);
		movedMouse(mouseData.x, mouseData.y, (event.movementX * mouseData.m), event.movementY);
	});

	return 1;
}

function introLine() {
	spineDataBG.state.setAnimation(0, 'Idle_background_00', true);
	spineDataBG.state.addAnimation(1, `Idle_0${LOADOUT.start}`, true, 0);

	let array = LOADOUT.introAudio[LOADOUT.start];
	let selection = Math.floor(Math.random() * array.in.length);

	// edge case for Arona in Plana sitting state
	if (!LOADOUT.isday && LOADOUT.start == 1 && LOADOUT.start2 == 1) {
		spineDataBG.state.addAnimation(4, 'Idle_11', true, 0);

		introTrack = playLine(
			{ filepath: LOADOUT.introAudio[4].in[0], dialog: LOADOUT.introAudio[4].in_dialog[0], dPositions: LOADOUT.introAudio[4].text_location, dSequence: LOADOUT.introAudio[4].in_speaker[0] },
			function() {
				if (enableIdleLines) introLoop = setInterval(idleLines, 15000);
			}
		)

		return;
	}

	introTrack = playLine(
		{ filepath: array.in[selection], dialog: array.in_dialog[selection], dPositions: array.text_location, dSequence: array.in_speaker[selection] },
		function() {
			if (enableIdleLines) introLoop = setInterval(idleLines, 15000);
		}
	)

	if (LOADOUT.isday && LOADOUT.start == 0 && spoilerChar) {
		spineDataBG.state.addAnimation(4, `Idle_1${(LOADOUT.start2 + 1)}`, true, 0);
		introTrack.addEventListener('ended', function() {
			setTimeout(function() {
				sideTrack = playLine(
					{ filepath: SPOILER_INTRO_AUDIO[LOADOUT.start2].in[selection], dialog: SPOILER_INTRO_AUDIO[LOADOUT.start2].in_dialog[selection], dPositions: SPOILER_INTRO_AUDIO[LOADOUT.start2].text_location, dSequence: SPOILER_INTRO_AUDIO[LOADOUT.start2].in_speaker[selection] }
				)
			}, 500);
		})
	}
}

function load() {
		// Wait until the AssetManager has loaded all resources, then load the skeletons.
		if (assetManager.isLoadingComplete() && typeof introAnimation !== 'undefined') {
		let dpr = window.devicePixelRatio || 1;
		canvas.style.width = window.innerWidth + 'px';
		canvas.style.height = window.innerHeight + 'px';
		canvas.width = window.innerWidth * dpr;
		canvas.height = window.innerHeight * dpr;

		loadoutSelect();

		if (!LOADOUT.isday && spoilerChar) {
			spineDataA = loadSpineData(ATLAS_PATH_2, BINARY_PATH_2, false);
			spineDataBG = loadSpineData(ATLAS_PATH_BG_NIGHT, BINARY_PATH_BG_NIGHT, false);
		}
		else {
			spineDataA = loadSpineData(ATLAS_PATH, BINARY_PATH, false);
			spineDataBG = loadSpineData(ATLAS_PATH_BG_DAY, BINARY_PATH_BG_DAY, false);
		}

		resize();
		interactionLoad();

		if (introAnimation) introLine();
		else {
			spineDataBG.state.setAnimation(0, 'Idle_background_00', true);
			spineDataBG.state.setEmptyAnimation(1, 0);
			spineDataBG.state.setEmptyAnimation(2, 0);

			spineDataA.state.setAnimation(0, 'Idle_01', true);
			alerted = true;
		}

		acceptingClick = true;

		// Plays BGM (if set)
		bgm = new Audio(bgmfile);
		bgm.volume = bgmvolume;
		bgm.play();
		bgm.addEventListener('ended', function() {
			this.currentTime = 0;
			this.play();
		}, false);

		lastFrameTime = Date.now() / 1000;
		requestAnimationFrame(render); // Loading is done, call render every frame.
	} else {
		requestAnimationFrame(load);
	}
}

function loadSpineData(a, b, premultipliedAlpha) {
	// Load the texture atlas from the AssetManager.
	let atlas = assetManager.get(a);

	// Create a AtlasAttachmentLoader that resolves region, mesh, boundingbox and path attachments
	let atlasLoader = new spine.AtlasAttachmentLoader(atlas);

	// Create a SkeletonBinary instance for parsing the .skel file.
	let skeletonBinary = new spine.SkeletonBinary(atlasLoader);

	// Set the scale to apply during parsing, parse the file, and create a new skeleton.
	skeletonBinary.scale = 1;
	let skeletonData = skeletonBinary.readSkeletonData(assetManager.get(b));
	let skeleton = new spine.Skeleton(skeletonData);
	let bounds = calculateSetupPoseBounds(skeleton);

	// Create an AnimationState, and set the initial animation in looping mode.
	let animationStateData = new spine.AnimationStateData(skeleton.data);
	animationStateData.defaultMix = 0.5;
	let animationState = new spine.AnimationState(animationStateData);

	// Pack everything up and return to caller.
	return { skeleton: skeleton, state: animationState, bounds: bounds, premultipliedAlpha: premultipliedAlpha };
}

function calculateSetupPoseBounds(skeleton) {
	skeleton.setToSetupPose();
	skeleton.updateWorldTransform();
	let offset = new spine.Vector2();
	let size = new spine.Vector2();
	skeleton.getBounds(offset, size, []);
	return { offset: offset, size: size };
}

function render() {
	let now = Date.now() / 1000;
	let delta = now - lastFrameTime;

	lastFrameTime = now;

	gl.clearColor(bufferColor[0], bufferColor[1], bufferColor[2], 1);
	gl.clear(gl.COLOR_BUFFER_BIT);

	// Apply the animation state based on the delta time.
	let skeleton = spineDataBG.skeleton;
	let state = spineDataBG.state;
	let premultipliedAlpha = spineDataBG.premultipliedAlpha;
	state.update(delta);
	state.apply(skeleton);
	skeleton.updateWorldTransform();

	// Bind the shader and set the texture and model-view-projection matrix.
	shader.bind();
	shader.setUniformi(spine.webgl.Shader.SAMPLER, 0);
	shader.setUniform4x4f(spine.webgl.Shader.MVP_MATRIX, mvp.values);

	// Start the batch and tell the SkeletonRenderer to render the active skeleton.
	batcher.begin(shader);

	skeletonRenderer.premultipliedAlpha = premultipliedAlpha;
	skeletonRenderer.draw(batcher, skeleton);
	if (alerted) {
		let skeleton2 = spineDataA.skeleton;
		let state2 = spineDataA.state;
		skeleton2.x = characterOffset.x;
		skeleton2.y = characterOffset.y;
		state2.update(delta);
		state2.apply(skeleton2);
		skeleton2.updateWorldTransform();
		skeletonRenderer.draw(batcher, skeleton2);
	};
	batcher.end();

	shader.unbind();

	// throttle fps
	let elapsed = Date.now() / 1000 - now;
	let targetFrameTime = 1 / targetFps;
	let delay = Math.max(targetFrameTime - elapsed, 0) * 1000;

	setTimeout(() => {
		requestAnimationFrame(render);
	}, delay);
}

function resize() {
	let dpr = window.devicePixelRatio || 1;
	let w = canvas.clientWidth;
	let h = canvas.clientHeight;
	if (canvas.width != w * dpr || canvas.height != h * dpr) {
		canvas.width = w * dpr;
		canvas.height = h * dpr;
	}

	// Calculations to center the skeleton in the canvas.
	let centerX = 0;
	let centerY = 900;
	let wr = w / 2880;
	let hr = h / 1620;
	let width = (2880 / customScale);
	let height = (1620 / customScale);

	if (wr < hr) {
		width = height * (w / h);

		transpose = 1620 / h;
	}
	else if (wr > hr) {
		height = width * (h / w);

		transpose = 2880 / w;
	}
	else {
		transpose = 1620 / h;
	}

	mvp.ortho2d(centerX - width / 2, centerY - height / 2, width, height);
	if (gl) gl.viewport(0, 0, canvas.width, canvas.height);
}

init();
