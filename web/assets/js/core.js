( async ( ) => {

    const os = require( 'os' );
    const fs = require( 'fs' );
    const plist = require( 'plist' );
    const IPC = require( './ipc.js' );
    const { getFonts } = require( 'font-list' );

    const { Terminal } = require( '@xterm/xterm' );
    const { FitAddon } = require( '@xterm/addon-fit' );
    const { WebglAddon } = require( '@xterm/addon-webgl' );
    const { SearchAddon } = require( '@xterm/addon-search' );
    const { WebLinksAddon } = require( 'xterm-addon-web-links' );

    const { ipcRenderer, clipboard, shell } = require( 'electron' );

    if( !localStorage.config ) localStorage.config = '{}';

    // localStorage proxy

    const changeListener = ( object, callbackMap, globalCallback, chain = [ ] ) => {
        if( !( object instanceof Object ) ) return object;

        for( const key in object ) {
            const value = object[ key ];
            const hook = callbackMap[ key ];
            if( !hook ) continue;

            object[ key ] = changeListener( value, hook, globalCallback, [ ... chain, key ] );
        }

        return new Proxy( object, {
            set: ( target, property, value ) => {
                target[ property ] = value;

                if( globalCallback ) globalCallback( chain, property, value );

                if( typeof callbackMap == 'function' ) {
                    callbackMap( );
                    return true;
                }

                const callback = callbackMap[ property ];
                if( typeof callback == 'function' ) {
                    callback( property, value );
                    return true;
                }
                return true;
            }
        } );
    }

    const config = JSON.parse( localStorage.getItem( 'config' ) );

    // Default configuration

    const DEFAULT_SHELL = process.platform == 'win32' ? 'powershell.exe' : ( process.env.SHELL || ( process.platform == 'darwin' ? '/bin/zsh' : '/bin/bash' ) );

    const DEFAULT_PALETTE = {
        foreground: '#cccccc',
        background: '#0c0c0c',
        black: '#000000',
        red: '#c30f1f',
        green: '#13a10e',
        yellow: '#c19c00',
        blue: '#0037da',
        magenta: '#881798',
        cyan: '#3a96dd',
        white: '#cccccc',
        brightBlack: '#767676',
        brightRed: '#e74856',
        brightGreen: '#16c60c',
        brightYellow: '#f9f1a5',
        brightBlue: '#3b78ff',
        brightMagenta: '#b4009e',
        brightCyan: '#61d6d6',
        brightWhite: '#f2f2f2'
    }

    const PRESET_DEFAULTS = {
        shell: {
            cwd: os.homedir( ),
            file: '',
            shell: DEFAULT_SHELL
        },
        ssh: {
            host: 'localhost',
            port: 22,
            username: os.userInfo( ).username,
            password: '123'
        },
        telnet: {
            host: 'localhost',
            port: 420
        },
        serial: {
            port: 'COM1',
            baudRate: 115200
        }
    }

    const DEFAULTS = {
        version: 1,
        font: {
            size: 14,
            family: 'Consolas'
        },
        cursor: 'block',
        shell: DEFAULT_SHELL,
        binds: {
            toggle: 'F10',
            instance: 'Shift+F10',
            kill: 'Control+Shift+F10',
            max: 'F11',
            ghost: 'Meta+Control',
            omnibox: 'Control+Shift+P',
            search: 'Control+Shift+F',
            copy: 'Control+Shift+C'
        },
        bounding: {
            x: 0,
            y: 0,
            width: 1,
            height: 0.4
        },
        startingDirectory: os.homedir( ),
        opacity: 0.75,
        presets: { },
        webgl: false,
        palettes: { },
        palette: -1
    }

    const correctConfig = ( object, defaults ) => {
        for( const key in defaults ) {
            if( typeof object[ key ] != typeof defaults[ key ] ) {
                object[ key ] = defaults[ key ];
                continue;
            }
            if( typeof object[ key ] == 'object' ) {
                correctConfig( object[ key ], defaults[ key ] );
            }
        }
    }

    correctConfig( config, DEFAULTS );

    const CONFIG = changeListener( config, {
        font: ( ) => eachInstance( instance => instance.setFont( CONFIG.font.family, CONFIG.font.size ) ),
        cursor: ( ) => eachInstance( instance => instance.terminal.options.cursorStyle = CONFIG.cursor ),
        opacity: ( ) => setOpacity( CONFIG.opacity ),
        palette: ( ) => reloadPalette( ),
        palettes: ( ) => reloadPalette( )
    }, ( ) => {
        localStorage.setItem( 'config', JSON.stringify( config ) );
    } );

    const UI = {
        container: $s( '.container' ),
        modal: $s( '.modal' ),
        modalWrapper: $s( '.modal-wrapper' ),
        modalTitle: $s( '.modal-title' ),
        modalBack: $s( '.modal-back' ),
        modalAction: $s( '.modal-action' ),
        modalClose: $s( '.modal-close' ),
        wrappers: $s( '.wrappers' ),
        tabs: $s( '.tabs' ),
        boundaries: {
            top: $s( '.boundary.top' ),
            bottom: $s( '.boundary.bottom' ),
            left: $s( '.boundary.left' ),
            right: $s( '.boundary.right' )
        },
        omniboxWrapper: $s( '.omnibox-wrapper' ),
        omnibox: $s( '.omnibox' ),
        tooltip: $s( '.tooltip' ),
        searchbox: $s( '.searchbox' ),
        boundaryActive: ( ) => $s( '.boundary.active' ),
        contextMenu: $s( '.context-menu' ),
    }

    const Language = {
        foreground: 'Foreground',
        background: 'Background',
        cursor: 'Cursor',
        cursorAccent: 'Cursor accent',
        selectionBackground: 'Selection background',
        selectionForeground: 'Selection foreground',
        black: 'Black',
        red: 'Red',
        green: 'Green',
        yellow: 'Yellow',
        blue: 'Blue',
        magenta: 'Magenta',
        cyan: 'Cyan',
        white: 'White',
        brightBlack: 'Bright black',
        brightRed: 'Bright red',
        brightGreen: 'Bright green',
        brightYellow: 'Bright yellow',
        brightBlue: 'Bright blue',
        brightMagenta: 'Bright magneta',
        brightCyan: 'Bright cyan',
        brightWhite: 'Bright white'
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

    const reloadPalette = ( ) => {
        const palette = CONFIG.palette == -1 ? DEFAULT_PALETTE : CONFIG.palettes[ CONFIG.palette ].scheme;
        if( !palette ) {
            CONFIG.palette = -1;
            return;
        }
        for( const instance of Object.values( instances ) ) {
            instance.terminal.options.theme = DEFAULT_PALETTE;
            instance.terminal.options.theme = palette;
        }
    }

    // XTerm.js opacity injection

    const opacityOverride = $qn( 'style', document.head );
    const setOpacity = opacity => opacityOverride.innerText = `:root { --oOpacity: ${ opacity } }`;

    const styleOverride = $qn( 'style', document.head );
    const overrideStyle = terminal => {
        styleOverride.innerText = null;
        const ownerElement = terminal.element;

        for( let i = 0; i < 259; i++ ) { // for some reason
            const override = '.xterm-bg-' + i;
            const element = $qn( override, ownerElement );

            const computedStyles = element.computedStyleMap( );
            const computedBackground = computedStyles.get( 'background-color' ).toString( );
            const altered = computedBackground.slice( 0, -1 ) + ', var(--oOpacity))';

            element.remove( );

            styleOverride.innerText += override + ` { background-color: ${ altered } !important; }`;
        }

        const overrideWrapper = $qn( '.xterm-selection', ownerElement );
        const element = $qn( 'div', overrideWrapper );

        const computedStyles = element.computedStyleMap( );
        const computedBackground = computedStyles.get( 'background-color' ).toString( );
        const altered = computedBackground.slice( 0, -1 ) + ', var(--oOpacity))';

        element.remove( );

        styleOverride.innerText += `.xterm-selection div { background-color: ${ altered } !important; }`;
    }

    //

    const modals = [ ];

    const modalActivate = ( ) => {
        $s( '.modal-body.active' )?.classList.remove( 'active' );

        const modal = modals.at( -1 );
        UI.modalTitle.innerText = modal.title;
        modal.body.classList.add( 'active' );

        if( modal.action ) {
            UI.modalAction.classList.add( 'active' );
            UI.modalAction.onclick = modal.action;
            if( modal.icon ) UI.modalAction.innerHTML = modal.icon;
        } else {
            UI.modalAction.classList.remove( 'active' );
        }

        if( modals.length > 1 ) {
            UI.modalBack.classList.add( 'active' );
        } else {
            UI.modalBack.classList.remove( 'active' );
        }
    }

    const modalBack = ( ) => {
        modals.pop( );
        modalActivate( );
    }

    UI.modalBack.onclick = modalBack;

    const modalOpen = ( { title, serial = false, action, icon } ) => {
        if( !serial ) modals.splice( 0 );

        const body = $n( {
            tag: 'div',
            class: 'modal-body',
            parent: UI.modal
        } );

        modals.push( {
            title,
            action,
            body,
            icon
        } );

        modalActivate( );
        return body;
    }

    const modalClose = ( ) => {
        modals.splice( 0 );
        $s( '.modal-body.active' )?.remove( );

        activeInstance.activate( );
    }

    UI.modalClose.onclick = UI.modalWrapper.onclick = modalClose;
    UI.modal.onclick = event => event.stopPropagation( );
    
    UI.omniboxWrapper.onclick = ( ) => UI.omniboxWrapper.classList.remove( 'active' );
    UI.omnibox.onclick = event => event.stopPropagation( );

    const sortable = new Sortable( UI.tabs, {
        animation: 150,
        ghostClass: 'ghost'
    } );

    const instances = { };
    let activeInstance;

    const eachInstance = callback => {
        for( const id in instances ) callback( instances[ id ] );
    }

    class Instance {
        constructor( mode, options ) {
            this.id = Date.now( );
            this.mode = mode;
            this.options = options;
            this.title = this.mode;

            this.mode ||= 'shell';
            this.options ||= {
                shell: CONFIG.shell,
                cwd: CONFIG.startingDirectory
            }

            // prepare elements

            this.tabElement = $n( {
                tag: 'div',
                parent: UI.tabs,
                class: 'tab red',
                onclick: this.activate
            } );

            this.titleElement = $n( {
                tag: 'span',
                parent: this.tabElement,
                text: this.title
            } );

            const titleChange = ( ) => {
                this.titleElement.contentEditable = true;
                this.titleElement.focus( );
            }

            this.titleElement.ondblclick = titleChange;

            ContextMenu( this.tabElement, {
                'Set tab color': {
                    'Default': ( ) => this.changeColor( ),
                    'Red': ( ) => this.changeColor( '#DC143C' ),
                    'Green': ( ) => this.changeColor( '#32cd32' ),
                    'Blue': ( ) => this.changeColor( '#1e90ff' ),
                    'Custom': event => {
                        event.stopPropagation( );
                        event.preventDefault( );
                        const input = $n( {
                            tag: 'input',
                            type: 'color',
                            parent: document.body,
                            onchange: ( ) => this.changeColor( input.value ),
                            onblur: ( ) => input.remove( )
                        } );
                        input.style.width = '0px';
                        input.style.height = '0px';
                        input.style.opacity = '0';
                        input.style.position = 'fixed';
                        input.style.left = event.x + 'px';
                        input.style.top = event.y + 'px';
                        input.focus( );
                        input.click( );
                    }
                },
                'Set tab title': titleChange
            } );

            this.titleElement.onkeydown = event => {
                if( event.key == 'Enter' ) {
                    event.preventDefault( );
                    this.titleElement.contentEditable = false;
                    const title = this.titleElement.innerText;
                    if( title.length < 2 ) {
                        this.changeTitle( this.title );
                        return;
                    }
                    this.customTitle = title;
                    return;
                }
            }

            this.closeElement = $n( {
                tag: 'div',
                class: 'close',
                parent: this.tabElement,
                html: '<i class="fa-solid fa-xmark"></i>',
                onclick: event => {
                    event.stopPropagation( );
                    this.kill( );
                }
            } );

            this.wrapperElement = $n( {
                tag: 'div',
                parent: UI.wrappers,
                class: 'wrapper'
            } );

            // terminal configuration

            this.terminal = new Terminal( {
                cursorBlink: true,
                fontFamily: CONFIG.font.family,
                cursorStyle: CONFIG.cursor,
                fontSize: CONFIG.font.size
            } );

            const palette = CONFIG.palette == -1 ? DEFAULT_PALETTE : CONFIG.palettes[ CONFIG.palette ].scheme;

            this.terminal.options.theme = palette;

            // addons

            this.fitAddon = new FitAddon( );
            this.terminal.loadAddon( this.fitAddon );

            this.webLinksAddon = new WebLinksAddon( ( _, uri ) => this.linkHandler( uri ) );
            this.terminal.loadAddon( this.webLinksAddon );

            if( CONFIG.webgl ) {
                this.webglAddon = new WebglAddon( );
                this.webglAddon.onContextLoss( ( ) => {
                    this.webglAddon.dispose( );
                } );

                this.terminal.loadAddon( this.webglAddon );
            }

            this.searchAddon = new SearchAddon( );
            this.terminal.loadAddon( this.searchAddon );

            this.terminal.open( this.wrapperElement );

            // transparency injection (not supported with webgl)

            if( !CONFIG.webgl ) {
                overrideStyle( this.terminal );
            }

            // events

            this.terminal.onData( this.out );
            this.terminal.onTitleChange( this.changeTitle );
            this.terminal.onBell( this.bell );

            // transformations

            const observer = new ResizeObserver( this.resize );
            observer.observe( this.wrapperElement );

            // initialize

            instances[ this.id ] = this;
            this.initialize( );
            this.activate( );
        }
        initialize = async ( ) => {
            this.ipc = await send( 'instance', {
                id: this.id,
                mode: this.mode,
                options: this.options,
                // callbacks
                write: data => this.in( data ),
                exit: reason => {
                    console.log( reason );
                    this.destroy( );
                }
            } );
        }
        linkHandler = uri => {
            shell.openExternal( uri );
        }
        in = data => {
            this.terminal.write( data );
        }
        out = data => {
            this.ipc.write( data );
        }
        changeTitle = title => {
            this.title = title.split( '\\' ).at( -1 );
            this.titleElement.innerText = this.customTitle || this.title;

            const duplicates = [ ];
            for( const id in instances ) {
                const instance = instances[ id ];
                if( instance.title != this.title ) continue;
                duplicates.push( {
                    id,
                    element: instance.titleElement
                } );
            }

            if( duplicates.length == 1 ) return;
            const ordered = duplicates.sort( ( a, b ) => a.id - b.id );
            for( let i = 0; i < ordered.length; i++ ) {
                ordered[ i ].element.innerText = this.title + ` (${ i + 1 })`
            }
        }
        changeColor = color => this.tabElement.style.backgroundColor = color ? color + '4f' : ''
        bell = ( ) => send( 'bell' )
        activate = ( ) => {
            activeInstance = this;

            const activeTab = $s( '.tab.active' );
            if( activeTab ) activeTab.classList.remove( 'active' );

            this.tabElement.classList.add( 'active' );

            const activeWrapper = $s( '.wrapper.active' );
            if( activeWrapper ) activeWrapper.classList.remove( 'active' );

            this.wrapperElement.classList.add( 'active' );

            this.terminal.focus( );
        }
        resize = ( ) => {
            if( this.wrapperElement.offsetHeight < 1 || this.wrapperElement.offsetWidth < 1 ) return;

            this.fitAddon.fit( );
            send( 'resize', {
                cols: this.terminal.cols,
                rows: this.terminal.rows
            } );
        }
        setFont = ( family, size ) => {
            this.terminal.options.fontFamily = family;
            if( size ) this.terminal.options.fontSize = size;

            this.resize( );
        }
        destroy = ( ) => {
            this.terminal.dispose( );
            this.tabElement.remove( );
            this.wrapperElement.remove( );
            delete instances[ this.id ];

            const dInstances = Object.values( instances );
            for( const instance of dInstances ) instance.changeTitle( instance.title );
            if( dInstances.length == 0 ) {
                new Instance( );
                return;
            }

            dInstances.at( -1 ).activate( );
        }
        kill = ( ) => killHandler( this.ipc )
    }

    const killHandler = ipc => {
        ipc.kill( false, killed => {
            if( killed ) return;
            const modal = modalOpen( { title: 'Confirm kill' } );
            $n( {
                tag: 'button',
                parent: modal,
                text: 'Confirm',
                onclick: ( ) => {
                    ipc.kill( true );
                    modalClose( );
                }
            } );
        } );
    }

    const keysDown = [ ];
    let comboListener;

    window.onkeydown = event => {
        if( keysDown.indexOf( event.key ) == -1 ) keysDown.push( event.key );
        if( comboListener ) {
            event.preventDefault( );
            comboListener( keysDown );
            return;
        }

        if( event.key == 'Escape' ) {
            modalClose( );
            UI.omniboxWrapper.classList.remove( 'active' );
            UI.searchbox.classList.remove( 'active' );
            return;
        }

        const combination = keysDown.join( '+' );

        // Omnibox
        if( combination == CONFIG.binds.omnibox ) {
            UI.omniboxWrapper.classList.toggle( 'active' );
            UI.omnibox.value = '';
            UI.omnibox.focus( );
            return;
        }

        // Search
        if( combination == CONFIG.binds.search ) {
            UI.searchbox.classList.toggle( 'active' );
            UI.searchbox.value = '';
            UI.searchbox.focus( );
            return;
        }

        // Search handling
        if( UI.searchbox == document.activeElement ) {
            const text = UI.searchbox.value;
            if( combination == 'Shift+Enter' ) {
                event.preventDefault( );
                activeInstance.searchAddon.findPrevious( text );
                return;
            }
            if( combination == 'Enter' ) {
                event.preventDefault( );
                activeInstance.searchAddon.findNext( text );
                return;
            }
        }

        // Copy to clipboard
        if( combination == CONFIG.binds.copy ) {
            const selection = activeInstance?.terminal.getSelection( );
            if( !selection ) return;

            clipboard.writeText( selection );
            return;
        }
    }

    window.onkeyup = event => {
        const index = keysDown.indexOf( event.key );
        if( index != -1 ) keysDown.splice( index, 1 );

        const combination = keysDown.join( '+' );

        // Search handling
        if( UI.searchbox == document.activeElement ) {
            if( event.key.length != 1 ) return;
            const text = UI.searchbox.value;
            activeInstance.searchAddon.findNext( text );
        }

        // Omnibox handling
        if( UI.omnibox == document.activeElement ) {
            if( event.key != 'Enter' ) return;
            UI.omniboxWrapper.classList.remove( 'active' );
            activeInstance.terminal.focus( );

            // EXPRESSION PARSING

            const command = UI.omnibox.value;
            const lowercase = command.toLowerCase( );
            const [ root, ... args ] = lowercase.split( ' ' );

            switch( root ) {
                case 'ssh':
                    const [ host, username, password ] = args;
                    new Instance( 'ssh', { host, username, password } );
                    break;
            }
        }
    }

    const buildSelect = ( { options, selected, parent, callback } ) => {
        const select = $n( {
            tag: 'select',
            parent
        } );
        if( options instanceof Array ) {
            for( let key = 0; key < options.length; key++ ) {
                const value = options[ key ];
                const element = $n( {
                    tag: 'option',
                    value: key,
                    text: value,
                    parent: select
                } );
                if( selected == key ) element.selected = 'selected';
            }
        } else {
            for( const key in options ) {
                const value = options[ key ];
                const element = $n( {
                    tag: 'option',
                    value: key,
                    text: value,
                    parent: select
                } );
                if( selected == key ) element.selected = 'selected';
            }
        }
        if( callback ) {
            select.addEventListener( 'change', ( ) => {
                callback( select.value );
            } );
        }
        return select;
    }

    const getKeyCombination = ( ) => new Promise( resolve => {
        const modal = modalOpen( {
            title: 'Enter key combination',
            serial: true
        } );
        const keysWrapper = $n( {
            tag: 'div',
            class: 'keys-wrapper',
            text: 'Waiting for input...',
            parent: modal
        } );
        let currentCombination;
        comboListener = keys => {
            currentCombination = [ ];
            keysWrapper.innerHTML = null;
            for( const key of keys ) {
                currentCombination.push( key );
                $qn( '.key', keysWrapper, key );
            }
        }
        $n( {
            tag: 'button',
            text: 'Confirm',
            parent: modal,
            onclick: ( ) => {
                comboListener = null;
                resolve( currentCombination );
                modalBack( );
            }
        } );
    } );

    const renderBinder = ( bind, parent ) => {
        const current = CONFIG.binds[ bind ];
        const rendered = current.split( '+' ).map( key => {
            if( key == 'Meta' ) key = '<i class="fa-brands fa-windows"></i>'
            if( key == 'Shift' ) key = '<i class="fa-solid fa-angles-down"></i>'
            return key
        } ).join( ' + ' );
        $n( {
            tag: 'button',
            html: rendered,
            parent,
            onclick: ( ) => {
                getKeyCombination( ).then( combination => {
                    const translated = combination.join( '+' );
                    CONFIG.binds[ bind ] = translated;
                    send( 'bind', {
                        name: bind,
                        combination: translated
                    } );
                    preferences( );
                } );
            }
        } );
    }

    const fontCache = {
        fonts: [ ],
        updated: 0
    }

    const Fonts = async ( ) => {
        const stamp = Date.now( );
        if( fontCache.updated + ( 1000 * 60 * 5 ) < stamp ) {
            const fonts = await getFonts( );

            const map = fonts.map(f=>Object({d:(f.startsWith('"')&&f.endsWith('"')?f.slice(1,-1):f), f})).sort((a,b)=>a.d-b.d).reduce((x, i)=>{x[i.f]=i.d;return x},{});
            fontCache.fonts = map;
            fontCache.updated = stamp;
        }
        return fontCache.fonts;
    }

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

    const editPalette = id => {
        const modal = modalOpen( {
            title: 'Palette editor',
            serial: true,
            action: ( ) => {
                CONFIG.palettes[ id ] = palette;
            },
            icon: '<i class="fa-solid fa-floppy-disk"></i>'
        } );

        const palette = CONFIG.palettes[ id ];

        const kvTitle = KV( {
            label: 'Palette title'
        }, modal );

        const titleInput = $n( {
            tag: 'input',
            parent: kvTitle,
            type: 'text',
            value: palette.title,
            onkeyup: ( ) => palette.title = titleInput.value
        } );

        for( const color in palette.scheme ) {
            const hex = palette.scheme[ color ];
            const kv = KV( {
                label: Language[ color ]
            }, modal );
            const input = $n( {
                tag: 'input',
                type: 'color',
                value: hex,
                parent: kv,
                onchange: ( ) => palette.scheme[ color ] = input.value
            } );
        }
    }

    const paletteMenu = ( ) => {
        const modal = modalOpen( {
            title: 'Terminal palette',
            serial: true
        } );

        const kvCurrent = KV( {
            label: 'Current palette',
            icon: '<i class="fa-regular fa-circle-check"></i>'
        }, modal );

        const select = $n( {
            tag: 'select',
            parent: kvCurrent,
            onchange: ( ) => {
                CONFIG.palette = Number( select.value );
                paletteMenu( );
            }
        } );

        for( const id in CONFIG.palettes ) {
            const palette = CONFIG.palettes[ id ];
            $n( {
                tag: 'option',
                text: palette.title,
                value: id,
                parent: select
            } );
        }

        $n( {
            tag: 'option',
            text: 'Default',
            value: '-1',
            parent: select
        } );

        select.value = CONFIG.palette ? CONFIG.palette : '-1';

        const kvNew = KV( {
            label: 'New theme',
            icon: '<i class="fa-solid fa-plus"></i>'
        }, modal );

        $n( {
            tag: 'button',
            parent: kvNew,
            html: '<i class="fa-solid fa-file-import"></i>',
            tooltip: 'Import an ITerm2 color scheme file',
            onclick: async ( ) => {
                const path = await send( 'selectFile' );
                fs.readFile( path, 'utf8', ( error, text ) => {
                    if( error ) return;
                    const palette = it_convert( text );
                    const id = Date.now( );
                    CONFIG.palettes[ id ] = {
                        title: 'Imported palette',
                        scheme: palette
                    }
                    paletteMenu( );
                } );
            }
        } );

        $n( {
            tag: 'button',
            parent: kvNew,
            html: '<i class="fa-solid fa-plus"></i>',
            onclick: ( ) => {
                const id = Date.now( );
                CONFIG.palettes[ id ] = {
                    title: 'New theme',
                    scheme: DEFAULT_PALETTE
                }
                paletteMenu( );
            }
        } );

        $qn( 'span.separator', modal, 'Available themes' );

        const wrapper = $qn( '.w.v', modal );

        for( const id in CONFIG.palettes ) {
            const palette = CONFIG.palettes[ id ];
            const kv = KV( {
                label: palette.title
            }, wrapper );
            $n( {
                tag: 'button',
                parent: kv,
                html: '<i class="fa-solid fa-trash"></i>',
                onclick: ( ) => {
                    delete CONFIG.palettes[ id ];
                    paletteMenu( );
                }
            } );
            $n( {
                tag: 'button',
                parent: kv,
                html: '<i class="fa-solid fa-angle-right"></i>',
                onclick: ( ) => editPalette( id )
            } );
        }
    }

    const executePreset = id => {
        const preset = CONFIG.presets[ id ];
        if( !preset ) {
            alert();
            return;
        }
        const instance = new Instance( preset.mode, preset.options );
        // TODO: add scripting
        // instance.out( preset.script );
        instance.changeTitle( preset.tabTitle );
        instance.changeColor( preset.tabColor );
    }

    const editPreset = id => {
        const preset = CONFIG.presets[ id ];

        let options = preset.options;
        let mode = preset.mode;
        let script = preset.script;
        let title = preset.title;
        let bind = preset.bind;
        let tabTitle = preset.tabTitle;
        let tabColor = preset.tabColor;

        const modal = modalOpen( {
            title: 'Edit preset',
            serial: true,
            action: ( ) => {
                CONFIG.presets[ id ] = {
                    options,
                    mode,
                    script,
                    title,
                    bind,
                    tabTitle,
                    tabColor
                }
                send( 'presetBind', {
                    combination: bind,
                    id,
                    callback: ( ) => executePreset( id )
                } );
            },
            icon: '<i class="fa-solid fa-floppy-disk"></i>'
        } );

        const kvTitle = KV( {
            label: 'Title'
        }, modal );

        const titleInput = $n( {
            tag: 'input',
            type: 'text',
            value: title,
            parent: kvTitle,
            onkeyup: ( ) => title = titleInput.value
        } );

        const kvTabTitle = KV( {
            label: 'Tab title'
        }, modal );

        const tabTitleInput = $n( {
            tag: 'input',
            type: 'text',
            value: tabTitle,
            parent: kvTabTitle,
            onkeyup: ( ) => tabTitle = tabTitleInput.value
        } );

        const kvTabColor = KV( {
            label: 'Tab color'
        }, modal );

        const tabColorInput = $n( {
            tag: 'input',
            type: 'color',
            value: tabColor,
            parent: kvTabColor,
            onchange: ( ) => tabColor = tabColorInput.value
        } );

        const kvBind = KV( {
            label: 'Keyboard shortcut'
        }, modal );

        const bindButton = $n( {
            tag: 'button',
            parent: kvBind,
            text: bind,
            onclick: ( ) => {
                getKeyCombination( ).then( combination => {
                    const translated = combination.join( '+' );
                    bind = bindButton.innerText = translated;
                } );
            }
        } );

        const kvMode = KV( {
            label: 'Mode'
        }, modal );

        const optionsWrapper = $qn( '.w.v', modal );

        const scriptInput = $n( {
            tag: 'textarea',
            parent: modal,
            type: 'text',
            placeholder: 'Your script goes here...',
            onkeyup: ( ) => script = scriptInput.value
        } );

        buildSelect( {
            parent: kvMode,
            options: {
                shell: 'Shell',
                telnet: 'Telnet',
                ssh: 'SSH',
                serial: 'Serial'
            },
            callback: async selected => {
                mode = selected;
                optionsWrapper.innerHTML = null;
                switch( mode ) {
                    case 'shell':
                        options = {
                            cwd: CONFIG.startingDirectory,
                            file: '',
                            shell: CONFIG.shell
                        }

                        const kvShell = KV( {
                            label: 'Shell',
                            icon: '<i class="fa-solid fa-terminal"></i>'
                        }, optionsWrapper );
                        const shellInput = $n( {
                            tag: 'input',
                            parent: kvShell,
                            type: 'text',
                            value: options.shell,
                            onchange: ( ) => options.shell = shellInput.value
                        } );

                        const kvCwd = KV( {
                            label: 'Working directory',
                            icon: '<i class="fa-solid fa-folder"></i>'
                        }, optionsWrapper );
                        const cwdButton = $n( {
                            tag: 'button',
                            parent: kvCwd,
                            text: options.cwd,
                            onclick: async ( ) => {
                                const directory = await send( 'selectDirectory' );
                                if( !directory ) return;
                                options.cwd = directory;
                                cwdButton.innerText = directory;
                            }
                        } );
                        break;
                    case 'ssh': {
                        options = {
                            host: '',
                            port: 22,
                            username: '',
                            password: ''
                        }

                        const kvHost = KV( {
                            label: 'Host',
                            icon: '<i class="fa-solid fa-server"></i>'
                        }, optionsWrapper );
                        const hostInput = $n( {
                            tag: 'input',
                            type: 'text',
                            parent: kvHost,
                            placeholder: 'localhost',
                            onchange: ( ) => options.host = hostInput.value
                        } );

                        const kvPort = KV( {
                            label: 'Port',
                            icon: '<i class="fa-solid fa-hashtag"></i>'
                        }, optionsWrapper );
                        const portInput = $n( {
                            tag: 'input',
                            type: 'number',
                            value: options.port,
                            parent: kvPort,
                            onchange: ( ) => options.port = portInput.value
                        } );

                        const kvUsername = KV( {
                            label: 'Username',
                            icon: '<i class="fa-solid fa-user"></i>'
                        }, optionsWrapper );
                        const usernameInput = $n( {
                            tag: 'input',
                            type: 'text',
                            parent: kvUsername,
                            placeholder: os.userInfo( ).username,
                            onchange: ( ) => options.username = usernameInput.value
                        } );

                        const kvPassword = KV( {
                            label: 'Password',
                            icon: '<i class="fa-solid fa-key"></i>'
                        }, optionsWrapper );
                        const passwordInput = $n( {
                            tag: 'input',
                            type: 'password',
                            parent: kvPassword,
                            placeholder: 'supersecretpassword',
                            onchange: ( ) => options.password = passwordInput.value
                        } );
                        break;
                    }
                    case 'serial':
                        options = {
                            path: '',
                            baudRate: 115200
                        }
                        const devices = await send( 'serialDevices' );
                        const kvDevice = KV( {
                            label: 'Device',
                            icon: '<i class="fa-solid fa-plug"></i>'
                        }, optionsWrapper );

                        const deviceList = devices.map( device => device.path );
                        options.path = deviceList[ 0 ];

                        buildSelect( {
                            options: deviceList,
                            parent: kvDevice,
                            callback: path => options.path = path
                        } );

                        const kvBaudRate = KV( {
                            label: 'Baudrate',
                            icon: '<i class="fa-solid fa-clock-rotate-left"></i>'
                        }, optionsWrapper );
                        const baudrateInput = $n( {
                            tag: 'input',
                            type: 'number',
                            value: 115200,
                            parent: kvBaudRate,
                            onchange: ( ) => {
                                options.baudRate = baudrateInput.value;
                            }
                        } );
                        break;
                    case 'telnet': {
                        options = {
                            host: '',
                            port: 23
                        }

                        const kvHost = KV( {
                            label: 'Host',
                            icon: '<i class="fa-solid fa-server"></i>'
                        }, optionsWrapper );
                        const hostInput = $n( {
                            tag: 'input',
                            type: 'text',
                            parent: kvHost,
                            placeholder: 'localhost',
                            onchange: ( ) => options.host = hostInput.value
                        } );

                        const kvPort = KV( {
                            label: 'Port',
                            icon: '<i class="fa-solid fa-hashtag"></i>'
                        }, optionsWrapper );
                        const portInput = $n( {
                            tag: 'input',
                            type: 'number',
                            value: options.port,
                            parent: kvPort,
                            onchange: ( ) => options.port = portInput.value
                        } );
                        break;
                    }
                }
            }
        } );
    }

    const presetsMenu = ( ) => {
        const modal = modalOpen( {
            title: 'Presets',
            serial: true,
            action: ( ) => {
                const id = Date.now( );
                CONFIG.presets[ id ] = {
                    title: 'New preset',
                    mode: 'shell',
                    options: PRESET_DEFAULTS.shell,
                    script: '',
                    bind: '',
                    tabTitle: '',
                    tabColor: ''
                }
                presetsMenu( );
            },
            icon: '<i class="fa-solid fa-plus"></i>'
        } );

        for( const id in CONFIG.presets ) {
            const preset = CONFIG.presets[ id ];

            const kv = KV( {
                label: preset.title
            }, modal );

            $n( {
                tag: 'button',
                parent: kv,
                html: '<i class="fa-solid fa-trash"></i>',
                onclick: ( ) => {
                    delete CONFIG.presets[ id ];
                    presetsMenu( );
                }
            } );

            $n( {
                tag: 'button',
                parent: kv,
                html: '<i class="fa-solid fa-angle-right"></i>',
                onclick: ( ) => editPreset( id )
            } );
        }
    }

    const preferences = async ( ) => {
        const modal = modalOpen( {
            title: 'Preferences'
        } );
        
        $qn( 'span.separator', modal, 'Appearance' );

        // Cursor style

        const kvCursor = KV( {
            label: 'Cursor style',
            icon: '<i class="fa-solid fa-i-cursor"></i>'
        }, modal );

        buildSelect( {
            options: {
                bar: 'Bar',
                block: 'Block',
                underline: 'Underline'
            },
            parent: kvCursor,
            selected: CONFIG.cursor,
            callback: option => CONFIG.cursor = option
        } );

        // Font family

        const kvFont = KV( {
            label: 'Font family',
            icon: '<i class="fa-solid fa-font"></i>'
        }, modal );

        const fonts = await Fonts( );

        buildSelect( {
            options: fonts,
            parent: kvFont,
            selected: CONFIG.font.family,
            callback: option => CONFIG.font.family = option
        } );

        // Font size

        const kvSize = KV( {
            label: 'Font size',
            icon: '<i class="fa-solid fa-text-width"></i>'
        }, modal );

        const fontSizeInput = $n( {
            tag: 'input',
            type: 'number',
            min: 8,
            max: 64,
            value: CONFIG.font.size,
            parent: kvSize,
            onchange: ( ) => {
                const size = fontSizeInput.value;
                CONFIG.font.size = fontSizeInput.value;
            }
        } );

        const kvOpacity = KV( {
            label: 'Terminal opacity',
            icon: '<i class="fa-solid fa-circle-half-stroke"></i>'
        }, modal );

        const opacityInput = $n( {
            tag: 'input',
            type: 'range',
            min: 0,
            max: 1,
            step: 0.01,
            value: CONFIG.opacity,
            parent: kvOpacity,
            oninput: ( ) => {
                const opacity = opacityInput.value;
                CONFIG.opacity = opacity;
            }
        } );

        // Themes

        const kvPalette = KV( {
            label: 'Terminal palette',
            icon: '<i class="fa-solid fa-palette"></i>'
        }, modal );

        $n( {
            tag: 'button',
            html: '<i class="fa-solid fa-angle-right"></i>',
            parent: kvPalette,
            onclick: paletteMenu
        } );

        // Presets

        const kvPresets = KV( {
            label: 'Presets',
            icon: '<i class="fa-solid fa-file-lines"></i>'
        }, modal );

        $n( {
            tag: 'button',
            html: '<i class="fa-solid fa-angle-right"></i>',
            parent: kvPresets,
            onclick: presetsMenu
        } );

        $qn( 'span.separator', modal, 'Behavior' );

        // Shell

        const kvShell = KV( {
            label: 'Shell',
            icon: '<i class="fa-solid fa-terminal"></i>'
        }, modal );

        const shellInput = $n( {
            tag: 'input',
            type: 'text',
            value: CONFIG.shell,
            parent: kvShell
        } );

        $n( {
            tag: 'button',
            html: '<i class="fa-solid fa-check"></i>',
            parent: kvShell,
            onclick: ( ) => {
                const shell = shellInput.value;
                CONFIG.shell = shell;
            }
        } );

        // Automatic launch

        const kvAutoLaunch = KV( {
            label: 'Run on startup',
            icon: '<i class="fa-solid fa-rocket"></i>'
        }, modal );

        const autoLaunchCheck = $n( {
            tag: 'input',
            type: 'checkbox',
            parent: kvAutoLaunch,
            onclick: async ( ) => {
                const result = await send( 'toggleAutoLaunch' );
                autoLaunchCheck.checked = result;
            },
            checked: await send( 'autoLaunch' )
        } );

        // Starting directory

        const kvStart = KV( {
            label: 'Starting directory',
            icon: '<i class="fa-solid fa-folder"></i>'
        }, modal );

        const startingButton = $n( {
            tag: 'button',
            parent: kvStart,
            text: CONFIG.startingDirectory,
            onclick: async ( ) => {
                const directory = await send( 'selectDirectory' );
                if( !directory ) return;
                CONFIG.startingDirectory = directory;
                startingButton.innerText = directory;
            }
        } );

        // Hardware rendering

        const kvWebgl = KV( {
            label: 'Accelerated terminal rendering',
            icon: '<i class="fa-solid fa-folder"></i>',
            tooltip: 'Accelerates terminal rendering using WebGL'
        }, modal );

        const webglSwitch = $n( {
            tag: 'input',
            type: 'checkbox',
            parent: kvWebgl,
            checked: CONFIG.webgl,
            onclick: async ( ) => {
                CONFIG.webgl = webglSwitch.checked;
            }
        } );

        $qn( 'span.separator', modal, 'Keyboard shortcuts' );

        // Binds

        const kvToggle = KV( {
            label: 'Toggle visibility',
            icon: '<i class="fa-solid fa-power-off"></i>'
        }, modal );
        renderBinder( 'toggle', kvToggle );

        const kvInstance = KV( {
            label: 'New instance',
            icon: '<i class="fa-solid fa-plus"></i>'
        }, modal );
        renderBinder( 'instance', kvInstance );

        const kvKill = KV( {
            label: 'Kill instance',
            icon: '<i class="fa-solid fa-skull-crossbones"></i>'
        }, modal );
        renderBinder( 'kill', kvKill );

        const kvMaximize = KV( {
            label: 'Toggle window size',
            icon: '<i class="fa-solid fa-keyboard"></i>'
        }, modal );
        renderBinder( 'max', kvMaximize );

        const kvGhost = KV( {
            label: 'Enter ghost mode',
            icon: '<i class="fa-solid fa-ghost"></i>'
        }, modal );
        renderBinder( 'ghost', kvGhost );

        const kvSearch = KV( {
            label: 'Search terminal',
            icon: '<i class="fa-solid fa-magnifying-glass"></i>'
        }, modal );
        renderBinder( 'search', kvSearch );

        const kvCopy = KV( {
            label: 'Copy from terminal',
            icon: '<i class="fa-solid fa-copy"></i>'
        }, modal );
        renderBinder( 'copy', kvCopy );

        const kvOmnibox = KV( {
            label: 'Show omnibox',
            icon: '<i class="fa-solid fa-star"></i>'
        }, modal );
        renderBinder( 'omnibox', kvOmnibox );

        // Info
        $qn( 'span.separator', modal, `WinGuake v${ info.version } (${ info.release ? 'Release' : 'Debug' })` );
    }

    for( const direction in UI.boundaries ) {
        const element = UI.boundaries[ direction ];
        element.onmousedown = event => {
            event.preventDefault( );
            event.stopPropagation( );

            send( 'resizeWindow', {
                state: true,
                direction
            } );
            element.classList.add( 'active' );
        }
    }

    window.onmouseup = ( ) => {
        send( 'resizeWindow', {
            state: false
        } );
        UI.boundaryActive( )?.classList.remove( 'active' );
    }

    const { send } = new IPC( ipcRenderer, ipcRenderer, {
        ghost: active => {
            if( active ) {
                UI.container.classList.add( 'ghost' );
                return;
            }
            UI.container.classList.remove( 'ghost' );
            activeInstance.terminal.focus( );
        },
        bounding: bounding => CONFIG.bounding = bounding,
        instance: target => {
            const options = {
                cwd: CONFIG.startingDirectory,
                file: undefined,
                shell: CONFIG.shell
            }
            const exists = fs.existsSync( target );
            if( exists ) {
                const stat = fs.statSync( target );
                const directory = stat.isDirectory( );

                if( directory ) {
                    this.options.cwd = target;
                } else {
                    this.options.file = target;
                }
            }
            new Instance( 'shell', options );
        },
        kill: ( ) => activeInstance.kill( )
    }, console.error );

    window.onfocus = ( ) => activeInstance.terminal.focus( );

    const instanceMenu = ( ) => {
        const modal = modalOpen( {
            title: 'New instance'
        } );

        let mode = 'shell';
        let options = { }

        const kvMode = KV( {
            label: 'Mode',
            icon: '<i class="fa-solid fa-square-binary"></i>'
        }, modal );

        buildSelect( {
            options: {
                serial: 'Serial',
                shell: 'Shell',
                ssh: 'SSH',
                telnet: 'Telnet'
            },
            callback: async selected => {
                mode = selected;
                optionsWrapper.innerHTML = null;
                switch( mode ) {
                    case 'shell':
                        options = {
                            cwd: CONFIG.startingDirectory,
                            file: '',
                            shell: CONFIG.shell
                        }

                        const kvShell = KV( {
                            label: 'Shell',
                            icon: '<i class="fa-solid fa-terminal"></i>'
                        }, optionsWrapper );
                        const shellInput = $n( {
                            tag: 'input',
                            parent: kvShell,
                            type: 'text',
                            value: options.shell,
                            onchange: ( ) => options.shell = shellInput.value
                        } );

                        const kvCwd = KV( {
                            label: 'Working directory',
                            icon: '<i class="fa-solid fa-folder"></i>'
                        }, optionsWrapper );
                        const cwdButton = $n( {
                            tag: 'button',
                            parent: kvCwd,
                            text: options.cwd,
                            onclick: async ( ) => {
                                const directory = await send( 'selectDirectory' );
                                if( !directory ) return;
                                options.cwd = directory;
                                cwdButton.innerText = directory;
                            }
                        } );
                        break;
                    case 'ssh': {
                        options = {
                            host: '',
                            port: 22,
                            username: '',
                            password: ''
                        }

                        const kvHost = KV( {
                            label: 'Host',
                            icon: '<i class="fa-solid fa-server"></i>'
                        }, optionsWrapper );
                        const hostInput = $n( {
                            tag: 'input',
                            type: 'text',
                            parent: kvHost,
                            placeholder: 'localhost',
                            onchange: ( ) => options.host = hostInput.value
                        } );

                        const kvPort = KV( {
                            label: 'Port',
                            icon: '<i class="fa-solid fa-hashtag"></i>'
                        }, optionsWrapper );
                        const portInput = $n( {
                            tag: 'input',
                            type: 'number',
                            value: options.port,
                            parent: kvPort,
                            onchange: ( ) => options.port = portInput.value
                        } );

                        const kvUsername = KV( {
                            label: 'Username',
                            icon: '<i class="fa-solid fa-user"></i>'
                        }, optionsWrapper );
                        const usernameInput = $n( {
                            tag: 'input',
                            type: 'text',
                            parent: kvUsername,
                            placeholder: os.userInfo( ).username,
                            onchange: ( ) => options.username = usernameInput.value
                        } );

                        const kvPassword = KV( {
                            label: 'Password',
                            icon: '<i class="fa-solid fa-key"></i>'
                        }, optionsWrapper );
                        const passwordInput = $n( {
                            tag: 'input',
                            type: 'password',
                            parent: kvPassword,
                            placeholder: 'supersecretpassword',
                            onchange: ( ) => options.password = passwordInput.value
                        } );
                        break;
                    }
                    case 'serial':
                        options = {
                            path: '',
                            baudRate: 115200
                        }
                        const devices = await send( 'serialDevices' );
                        const kvDevice = KV( {
                            label: 'Device',
                            icon: '<i class="fa-solid fa-plug"></i>'
                        }, optionsWrapper );

                        const deviceList = devices.map( device => device.path );
                        options.path = deviceList[ 0 ];

                        buildSelect( {
                            options: deviceList,
                            parent: kvDevice,
                            callback: path => options.path = path
                        } );

                        const kvBaudRate = KV( {
                            label: 'Baudrate',
                            icon: '<i class="fa-solid fa-clock-rotate-left"></i>'
                        }, optionsWrapper );
                        const baudrateInput = $n( {
                            tag: 'input',
                            type: 'number',
                            value: 115200,
                            parent: kvBaudRate,
                            onchange: ( ) => {
                                options.baudRate = baudrateInput.value;
                            }
                        } );
                        break;
                    case 'telnet': {
                        options = {
                            host: '',
                            port: 23
                        }

                        const kvHost = KV( {
                            label: 'Host',
                            icon: '<i class="fa-solid fa-server"></i>'
                        }, optionsWrapper );
                        const hostInput = $n( {
                            tag: 'input',
                            type: 'text',
                            parent: kvHost,
                            placeholder: 'localhost',
                            onchange: ( ) => options.host = hostInput.value
                        } );

                        const kvPort = KV( {
                            label: 'Port',
                            icon: '<i class="fa-solid fa-hashtag"></i>'
                        }, optionsWrapper );
                        const portInput = $n( {
                            tag: 'input',
                            type: 'number',
                            value: options.port,
                            parent: kvPort,
                            onchange: ( ) => options.port = portInput.value
                        } );
                        break;
                    }
                }
            },
            parent: kvMode
        } );

        const optionsWrapper = $qn( '.w.v', modal );

        $n( {
            tag: 'button',
            parent: modal,
            text: 'Start instance',
            onclick: ( ) => {
                modalClose( );
                new Instance( mode, options );
            }
        } );
    }

    let info;
    const initialize = async ( ) => {
        info = await send( 'initialize' );

        setOpacity( CONFIG.opacity );

        btn_preferences.onclick = preferences;
        btn_instance.onclick = async ( ) => {
            if( keysDown.includes( 'Shift' ) ) {
                instanceMenu( );
                return;
            }
            new Instance( );
        }

        for( const bind in CONFIG.binds ) {
            send( 'bind', {
                name: bind,
                combination: CONFIG.binds[ bind ]
            } )
        }

        send( 'bounding', CONFIG.bounding );

        new Instance( );

        await Fonts( ); // prevent delayed loads

        for( const id in CONFIG.presets ) {
            const preset = CONFIG.presets[ id ];
            console.log( preset );
            send( 'presetBind', {
                combination: preset.bind,
                id,
                callback: ( ) => executePreset( id )
            } );
        }
    }

    initialize( );

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
        element.onmousedown = event => {
            if( event.which != 3 ) return;
            event.preventDefault( );
            event.stopPropagation( );
            UI.contextMenu.style.left = event.clientX + 'px';
            UI.contextMenu.style.top = event.clientY + 'px';
            UI.contextMenu.classList.add( 'active' );
            UI.contextMenu.innerHTML = null;

            buildContextMenu( UI.contextMenu, options );
        }
    }

    window.onmousedown = event => {
        if( event.which == 3 ) {
            UI.contextMenu.classList.remove( 'active' );
        }
    }

    window.onclick = event => UI.contextMenu.classList.remove( 'active' );

    window.onmousemove = event => {
        const element = event.target;

        UI.tooltip.style.top = event.y + 'px';
        UI.tooltip.style.left = event.x + 'px';
        if( !element.hasAttribute( 'tooltip' ) ) {
            UI.tooltip.classList.remove( 'active' );
            return;
        }

        const tooltip = element.getAttribute( 'tooltip' );
        UI.tooltip.innerText = tooltip;
        UI.tooltip.classList.add( 'active' );
    }

} )( );