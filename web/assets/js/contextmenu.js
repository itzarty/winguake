const contextMenu = $s( '.context-menu' );

const buildContextMenu = ( parent, options ) => {
    for( const option in options ) {
        const value = options[ option ];
        if( typeof value == 'function' ) {
            $n( {
                tag: 'div',
                class: 'context-option',
                parent,
                text: option,
                onclick: value
            } );
        }
        if( typeof value == 'object' ) {
            const item = $n( {
                tag: 'div',
                class: 'context-option',
                parent,
                text: option
            } );
            const sub = $n( {
                tag: 'div',
                class: 'context-menu sub',
                parent: item
            } );
            buildContextMenu( sub, value );
        }
    }
}

const ContextMenu = ( element, options ) => {
    element.addEventListener( 'mousedown', event => {
        if( event.which != 3 ) return;
        event.preventDefault( );
        event.stopPropagation( );
        contextMenu.style.left = event.clientX + 'px';
        contextMenu.style.top = event.clientY + 'px';
        contextMenu.classList.add( 'active' );
        contextMenu.innerHTML = null;

        buildContextMenu( contextMenu, options );
    } );
}

window.addEventListener( 'mousedown', event => {
    if( event.which != 3 ) return;
    contextMenu.classList.remove( 'active' );
} );

window.addEventListener( 'click', event => {
    contextMenu.classList.remove( 'active' );
} );