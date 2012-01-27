/*
 * Jukebox
 * http://github.com/zynga/jukebox
 *
 * Copyright 2011, Zynga Inc.
 * Developed by Christoph Martens (@martensms)
 *
 * Licensed under the MIT License.
 * https://raw.github.com/zynga/jukebox/master/MIT-LICENSE.txt
 *
 */

if (this.jukebox === undefined) {
	throw "jukebox.Manager requires jukebox.Player (Player.js) to run properly."
}


/*
 * This is the transparent jukebox.Manager that runs in the background
 *
 * You shouldn't call the constructor, a jukebox.Manager instance is automatically
 * created if you create a jukebox.Player instance.
 *
 * If you need to call the constructor before instanciating the jukebox.Player,
 * you should take a look for the Game Loop integration demo (demo/game.html)
 *
 *
 * @param {Object} settings The settings object (see defaults for more details)
 */
jukebox.Manager = function(settings) {

	this.features = {};
	this.codecs = {};

	// Correction, Reset & Pause
	this.__players = {};
	this.__playersLength = 0;

	// Queuing functionality
	this.__clones = {};
	this.__queue = [];


	this.settings = {};

	for (var d in this.defaults) {
		this.settings[d] = this.defaults[d];
	}

	if (Object.prototype.toString.call(settings) === '[object Object]') {
		for (var s in settings) {
			this.settings[s] = settings[s];
		}
	}


	this.__detectFeatures();


	// If you don't want to use an own game loop
	if (this.settings.useGameLoop === false) {

		jukebox.Manager.__initialized = window.setInterval(function() {
			jukebox.Manager.loop();
		}, 20);

	} else {
		jukebox.Manager.__initialized = true;
	}

};

jukebox.Manager.prototype = {

	defaults: {
		useFlash: false, // enforce Flash Fallback
		useGameLoop: false // use own game loop (interval)
	},

	__detectFeatures: function() {

		/*
		 * HTML5 Audio Support
		 */
		var audio = window.Audio && new Audio();

		if (audio && audio.canPlayType && this.settings.useFlash === false) {

			// Codec Detection MIME List
			var mimeList = [
				// e = extension, m = mime type
				{ e: '3gp', m: [ 'audio/3gpp', 'audio/amr' ] },
				// { e: 'avi', m: 'video/x-msvideo' }, // avi container allows pretty everything, impossible to detect -.-
				{ e: 'aac', m: [ 'audio/aac', 'audio/aacp' ] },
				{ e: 'amr', m: [ 'audio/amr', 'audio/3gpp' ] },
				{ e: 'm4a', m: [ 'audio/mp4', 'audio/mp4; codecs="mp4a.40.2,avc1.42E01E"', 'audio/mpeg4', 'audio/mpeg4-generic', 'audio/mp4a-latm', 'audio/MP4A-LATM', 'audio/x-m4a' ] },
				{ e: 'mp3', m: [ 'audio/mp3', 'audio/mpeg', 'audio/mpeg; codecs="mp3"', 'audio/MPA', 'audio/mpa-robust' ] }, // mpeg was name for mp2 and mp3! avi container was mp4/m4a
				{ e: 'mpga', m: [ 'audio/MPA', 'audio/mpa-robust', 'audio/mpeg', 'video/mpeg' ] },
				{ e: 'mp4', m: [ 'audio/mp4', 'video/mp4' ] },
				{ e: 'ogg', m: [ 'application/ogg', 'audio/ogg', 'audio/ogg; codecs="theora, vorbis"', 'video/ogg', 'video/ogg; codecs="theora, vorbis"' ] },
				{ e: 'wav', m: [ 'audio/wave', 'audio/wav', 'audio/wav; codecs="1"', 'audio/x-wav', 'audio/x-pn-wav' ] },
				{ e: 'webm', m: [ 'audio/webm', 'audio/webm; codecs="vorbis"', 'video/webm' ] }
			];

			var mime, extension;
			for (var m = 0, l = mimeList.length; m < l; m++) {

				extension = mimeList[m].e;

				if (mimeList[m].m.length && typeof mimeList[m].m === 'object') {

					for (var mm = 0, mml = mimeList[m].m.length; mm < mml; mm++) {

						mime = mimeList[m].m[mm];

						// Supported Codec was found for Extension, so skip redundant checks
						if (audio.canPlayType(mime) !== "") {
							this.codecs[extension] = mime;
							break;

						// Flag the unsupported extension (that it is also not supported for Flash Fallback)
						} else if (!this.codecs[extension]) {
							this.codecs[extension] = false;
						}

					}

				}

				// Go, GC, Go for it!
				mime = null;
				extension = null;

			}

			// Browser supports HTML5 Audio API theoretically, but support depends on Codec Implementations
			this.features.html5audio = !!(this.codecs.mp3 || this.codecs.ogg || this.codecs.webm || this.codecs.wav);

			// Default Channel Amount is 8, known to work with all Browsers
			this.features.channels = 8;

			// Detect Volume support
			audio.volume = 0.1;
			this.features.volume = !!audio.volume.toString().match(/^0\.1/);



			// FIXME: HACK, but there's no way to detect these crappy implementations
			if (
				// navigator.userAgent.match(/MSIE 9\.0/) ||
				navigator.userAgent.match(/iPhone|iPod|iPad/i)) {
				this.features.channels = 1;
			}

		}



		/*
		 * Flash Audio Support
		 *
		 * Hint: All Android devices support Flash, even Android 1.6 ones
		 *
		 */
		this.features.flashaudio = !!navigator.mimeTypes['application/x-shockwave-flash'] || !!navigator.plugins['Shockwave Flash'] || false;

		// Internet Explorer
		if (window.ActiveXObject){
			try {
				var flash = new ActiveXObject('ShockwaveFlash.ShockwaveFlash.10');
				this.features.flashaudio = true;
			} catch(e) {
				// Throws an error if the version isn't available
			}
		}

		// Allow enforce of Flash Usage
		if (this.settings.useFlash === true) {
			this.features.flashaudio = true;
		}

		if (this.features.flashaudio === true) {

			// Overwrite Codecs only if there's no HTML5 Audio support
			if (!this.features.html5audio) {

				// Known to work with every Flash Implementation
				this.codecs.mp3 = 'audio/mp3';
				this.codecs.mpga = 'audio/mpeg';
				this.codecs.mp4 = 'audio/mp4';
				this.codecs.m4a = 'audio/mp4';


				// Flash Runtime on Android also supports GSM codecs, but impossible to detect
				this.codecs['3gp'] = 'audio/3gpp';
				this.codecs.amr = 'audio/amr';


				// TODO: Multi-Channel support on ActionScript-side
				this.features.volume = true;
				this.features.channels = 1;

			}

		}

	},


	__getPlayerById: function(id) {

		if (this.__players && this.__players[id] !== undefined) {
			return this.__players[id];
		}

		return null;

	},

	__getClone: function(origin, settings) {

		// Search for a free clone
		for (var cloneId in this.__clones) {

			var clone = this.__clones[cloneId];
			if (
				clone.isPlaying === null
				&& clone.origin === origin
			) {
				return clone;
			}

		}


		// Create a new clone
		if (Object.prototype.toString.call(settings) === '[object Object]') {

			var cloneSettings = {};
			for (var s in settings) {
				cloneSettings[s] = settings[s];
			}

			// Clones just don't autoplay. Just don't :)
			cloneSettings.autoplay = false;

			var newClone = new jukebox.Player(cloneSettings, origin);
			newClone.isClone = true;
			newClone.wasReady = false;

			this.__clones[newClone.id] = newClone;

			return newClone;

		}

		return null;

	},



	/*
	 * PUBLIC API
	 */

	/*
	 * This is the jukebox.Manager's stream-correction loop.
	 *
	 * You are "allowed" to call it yourself, if you created the jukebox.Manager
	 * instance with useGameLoop = true in the constructor's settings.
	 */
	loop: function() {

		// Nothing to do
		if (
			this.__playersLength === 0
			// || jukebox.Manager.__initialized !== true
		) {
			return;
		}


		// Queue Functionality for Clone-supporting environments
		if (
			this.__queue.length
			&& this.__playersLength < this.features.channels
		) {

			var queueEntry = this.__queue[0],
				originPlayer = this.__getPlayerById(queueEntry.origin);

			if (originPlayer !== null) {

				var freeClone = this.__getClone(queueEntry.origin, originPlayer.settings);

				// Use free clone for playback
				if (freeClone !== null) {

					if (this.features.volume === true) {
						var originPlayer = this.__players[queueEntry.origin];
						originPlayer && freeClone.setVolume(originPlayer.getVolume());
					}

					this.add(freeClone);
					freeClone.play(queueEntry.pointer, true);

				}

			}

			// Remove Queue Entry. It's corrupt if nothing happened.
			this.__queue.splice(0, 1);

			return;


		// Queue Functionality for Single-Mode (iOS)
		} else if (
			this.__queue.length
			&& this.features.channels === 1
		) {

			var queueEntry = this.__queue[0],
				originPlayer = this.__getPlayerById(queueEntry.origin);

			if (originPlayer !== null) {
				originPlayer.play(queueEntry.pointer, true);
			}

			// Remove Queue Entry. It's corrupt if nothing happened
			this.__queue.splice(0, 1);

		}



		for (var id in this.__players) {

			var player = this.__players[id],
				playerPosition = player.getCurrentTime() || 0;


			// Correction
			if (player.isPlaying && player.wasReady === false) {

				player.wasReady = player.setCurrentTime(player.isPlaying.start);

			// Reset / Stop
			} else if (player.isPlaying && player.wasReady === true){

				if (playerPosition > player.isPlaying.end) {

					if (player.isPlaying.loop === true) {
						player.play(player.isPlaying.start, true);
					} else {
						player.stop();
					}

				}


			// Remove Idling Clones
			} else if (player.isClone && player.isPlaying === null) {

				this.remove(player);
				continue;


			// Background Music for Single-Mode (iOS)
			} else if (player.__backgroundMusic !== undefined && player.isPlaying === null) {

				if (playerPosition > player.__backgroundMusic.end) {
					player.__backgroundHackForiOS();
				}

			}

		}


	},

	/*
	 * This will check an array for playable resources, depending on the previously
	 * detected codecs and features.
	 *
	 * @param {Array} resources The array of resources (e.g. [ "first/file.ogg", "./second/file.mp3" ])
	 * @returns {String|Null} resource The playable resource. If no resource was found, null is returned.
	 */
	getPlayableResource: function(resources) {

		if (Object.prototype.toString.call(resources) !== '[object Array]') {
			resources = [ resources ];
		}


		for (var r = 0, l = resources.length; r < l; r++) {

			var resource = resources[r],
				extension = resource.match(/\.([^\.]*)$/)[1];

			// Yay! We found a supported resource!
			if (extension && !!this.codecs[extension]) {
				return resource;
			}

		}

		return null;

	},

	/*
	 * This function adds a jukebox.Player to the jukebox.Manager's loop
	 * @params {jukebox.Player} jukebox.Player instance
	 */
	add: function(player) {

		if (
			player instanceof jukebox.Player
			&& this.__players[player.id] === undefined
		) {
			this.__playersLength++;
			this.__players[player.id] = player;
			return true;
		}

		return false;

	},

	/*
	 * This function removes a jukebox.Player from the jukebox.Manager's loop
	 * @params {jukebox.Player} jukebox.Player instance
	 */
	remove: function(player) {

		if (
			player instanceof jukebox.Player
			&& this.__players[player.id] !== undefined
		) {
			this.__playersLength--;
			delete this.__players[player.id];
			return true;
		}

		return false;

	},

	/*
	 * This function is kindof public, but only used for Queue Delegation
	 *
	 * DON'T USE IT.
	 *
	 */
	addToQueue: function(pointer, playerId) {

		if (
			(typeof pointer === 'string' || typeof pointer === 'number')
			&& this.__players[playerId] !== undefined
		) {

			this.__queue.push({
				pointer: pointer,
				origin: playerId
			});

			return true;

		}

		return false;

	}

};
