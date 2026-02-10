const plist = require( 'plist' );

const ConfigBuilder = ( entries, parent ) => {
    for( const entry of entries ) {
        if( entry.type == 'section' ) {
            $qn( 'span.separator', parent, entry.label );
            continue;
        }
        const kv = KV( {
            label: entry.label,
            icon: entry.icon,
            tooltip: entry.tooltip
        }, parent );

        const modules = entry.type ? [ entry ] : entry.modules;

        const values = Array( modules.length );
        const emit = ( value, index ) => {
            values[ index ] = value;
            if( values.length == 1 ) {
                modules[ 0 ].callback( value );
            } else {
                for( const mod of modules ) {
                    if( !mod.callback ) continue;
                    mod.callback( ... values );
                }
            }
        }

        for( let i = 0; i < modules.length; i++ ) {
            const mod = modules[ i ];
            switch( mod.type ) {
                case 'select':
                    const select = $qn( 'select', kv );
                    if( mod.options instanceof Array ) {
                        for( const entry of mod.options ) {
                            const element = $n( {
                                tag: 'option',
                                value: entry,
                                text: entry,
                                parent: select
                            } );
                            if( mod?.selected == entry ) element.selected = 'selected';
                        }
                    } else {
                        for( const key in mod.options ) {
                            const value = mod.options[ key ];
                            const element = $n( {
                                tag: 'option',
                                value: key,
                                text: value,
                                parent: select
                            } );
                            if( mod?.selected == key ) element.selected = 'selected';
                        }
                    }
                    select.onchange = ( ) => emit( select.value, i );
                    break;
                case 'range':
                case 'number': {
                    const input = $n( {
                        tag: 'input',
                        type: mod.type,
                        parent: kv
                    } );
                    if( typeof mod.min == 'number' ) input.min = mod.min;
                    if( typeof mod.max == 'number' ) input.max = mod.max;
                    if( mod.step ) input.step = mod.step;
                    if( typeof mod.value == 'number' ) input.value = mod.value;
                    input.oninput = ( ) => emit( Number( input.value ), i );
                    break;
                }
                case 'button': {
                    const button = $n( {
                        tag: 'button',
                        parent: kv,
                        html: mod.html,
                        onclick: ( ) => emit( button, i )
                    } );
                    break;
                }
                case 'text': {
                    const input = $n( {
                        tag: 'input',
                        type: 'text',
                        parent: kv,
                        oninput: ( ) => emit( input.value, i )
                    } );
                    if( mod.value ) input.value = mod.value;
                    break;
                }
                case 'switch': {
                    const input = $n( {
                        tag: 'input',
                        type: 'checkbox',
                        parent: kv,
                        onchange: ( ) => emit( input.checked, i )
                    } );
                    if( mod.checked ) input.checked = true;
                    break;
                }
                case 'color': {
                    const input = $n( {
                        tag: 'input',
                        type: 'color',
                        parent: kv,
                        oninput: ( ) => emit( input.value, i )
                    } );
                    if( mod.value ) input.value = mod.value;
                    break;
                }
            }
        }
    }
}

const arrMap = ( array, key, value ) => array.reduce( ( accumulator, entry ) => {
    const k = entry[ key ];
    const v = value ? entry[ value ] : entry;
    accumulator[ k ] = v;
    return accumulator;
}, { } );

const KV = ( { label, icon, content, tooltip }, parent ) => {
    const wrapper = $qn( '.kv', parent );

    const keyWrapper = $qn( '.k', wrapper );
    if( icon ) keyWrapper.innerHTML += icon;
    const labelElement = $qn( 'span', keyWrapper, label );
    if( tooltip ) labelElement.setAttribute( 'tooltip', tooltip );

    const valueElement = $qn( '.v', wrapper );
    if( content ) valueElement.innerHTML = content;
    return valueElement;
}

const it_hex = dict => {
    if( !dict ) return;

    const r = Math.round( ( dict[ 'Red Component' ] || 0 ) * 255 );
    const g = Math.round( ( dict[ 'Green Component' ] || 0 ) * 255 );
    const b = Math.round( ( dict[ 'Blue Component' ] || 0 ) * 255 );

    return '#' + [ r, g, b ].map( c => c.toString( 16 ).padStart( 2, '0' ) ).join( '' );
}

const it_dict = {
    background: 'Background Color',
    foreground: 'Foreground Color',
    cursor: 'Cursor Color',
    cursorAccent: 'Cursor Text Color',
    selectionBackground: 'Selection Color',
    selectionForeground: 'Selected Text Color'
}

const it_list = [ 'black', 'red', 'green', 'yellow', 'blue', 'magenta', 'cyan', 'white', 'brightBlack', 'brightRed', 'brightGreen', 'brightYellow', 'brightBlue', 'brightMagenta', 'brightCyan', 'brightWhite' ];

const it_convert = text => {
    const it = plist.parse( text );
    const result = { }

    for( const key in it_dict ) {
        const value = it_dict[ key ];
        result[ key ] = it_hex( it[ value ] );
    }

    for( let i = 0; i < 16; i++ ) {
        const key = it_list[ i ];
        result[ key ] = it_hex( it[ `Ansi ${ i } Color` ] );
    }

    return result;
}