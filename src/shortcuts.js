const { uIOhook } = require( 'uiohook-napi' );

Array.prototype.compare = function( array ) {
    if( this.length != array.length ) return false;
    for( let i = 0; i < this.length; i++ ) {
        if( this[ i ] != array[ i ] ) return false;
    }
    return true;
}

module.exports = binds => {
    const keysDown = [ ];

    uIOhook.on( 'keydown', event => {
        if( keysDown.indexOf( event.keycode ) == -1 ) keysDown.push( event.keycode );

        for( const bind in binds ) {
            const { combination, down } = binds[ bind ];
            if( !down ) continue;
            if( !combination.compare( keysDown ) ) continue;
            down( );
        }
    } );

    uIOhook.on( 'keyup', event => {
        for( const bind in binds ) {
            const { combination, up } = binds[ bind ];
            if( !up ) continue;
            if( !combination.compare( keysDown ) ) continue;
            up( );
        }

        const index = keysDown.indexOf( event.keycode );
        if( index != -1 ) keysDown.splice( index, 1 );
    } );

    uIOhook.start( );
}