class AudioEngine {
    constructor( ) {
        this.context = new AudioContext( );
        this.register = { }

        this.masterGain = this.context.createGain( );
        this.masterGain.connect( this.context.destination );
    }
    async load( name, source ) { 
        const response = await fetch( source );
        const arrayBuffer = await response.arrayBuffer( );
        const audioBuffer = await this.context.decodeAudioData( arrayBuffer );

        this.register[ name ] = audioBuffer;
    }
    async loadManifest( manifest ) {
        const promises = Object.entries( manifest ).map( ( [ name, source ] ) => this.load( name, source ) );
        await Promise.all( promises );
    }
    play( name, options ) {
        const buffer = this.register[ name ];
        if( !buffer ) return;

        const source = this.context.createBufferSource( );
        source.buffer = buffer;

        if( options?.pitchVariation > 0 ) {
            const v = 1 + ( Math.random( ) * options.pitchVariation - options.pitchVariation / 2 );
            source.playbackRate.value = v;
        }

        const gainNode = this.context.createGain( );
        gainNode.gain.value = options?.volume || 1;

        source.connect( gainNode ).connect( this.masterGain );
        source.start( 0 );

        source.onended = ( ) => {
            source.disconnect( );
            gainNode.disconnect( );
        }
    }
    async sinks( ) {
        const devices = await navigator.mediaDevices.enumerateDevices( );
        const sinks = devices.filter( device => device.kind == 'audiooutput' );
        return sinks;
    }
    async setSink( id ) {
        this.context.setSinkId( id );
    }
    setVolume( volume ) {
        const now = this.context.currentTime;
        this.masterGain.gain.setTargetAtTime( volume, now, 0.01 );
    }
}
