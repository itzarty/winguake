( async ( ) => {

    const { Terminal } = require( '@xterm/xterm' );
    const { FitAddon } = require( '@xterm/addon-fit' );
    const { WebLinksAddon } = require( 'xterm-addon-web-links' );
    const { ipcRenderer, clipboard, shell } = require( 'electron' );
    const { getFonts } = require( 'font-list' );
    const fs = require( 'fs' );
    const os = require( 'os' );

    const IPC = require( './ipc.js' );

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

    const CONFIG = changeListener( config, {
        font: ( ) => eachInstance( instance => instance.setFont( CONFIG.font.family, CONFIG.font.size ) ),
        cursor: ( ) => eachInstance( instance => instance.terminal.options.cursorStyle = CONFIG.cursor ),
        binds: ( property, value ) => console.log( 'bind', property, value ),
        opacity: ( ) => setOpacity( CONFIG.opacity )
    }, ( ) => {
        localStorage.setItem( 'config', JSON.stringify( config ) );
    } );

    // Default configuration

    const DEFAULT_SHELL = process.platform == 'win32' ? 'powershell.exe' : ( process.env.SHELL || ( process.platform == 'darwin' ? '/bin/zsh' : '/bin/bash' ) );

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
            ghost: 'Meta+Control'
        },
        bounding: {
            x: 0,
            y: 0,
            width: 1,
            height: 0.4
        },
        startingDirectory: os.homedir( ),
        opacity: 0.75,
        presets: [ ]
    }

    for( const key in DEFAULTS ) {
        if( CONFIG[ key ] != null ) continue;
        const value = DEFAULTS[ key ];
        CONFIG[ key ] = value;
    }

    const UI = {
        container: $s( '.container' ),
        modal: $s( '.modal' ),
        modalWrapper: $s( '.modal-wrapper' ),
        modalBody: $s( '.modal-body' ),
        modalTitle: $s( '.modal-title' ),
        wrappers: $s( '.wrappers' ),
        tabs: $s( '.tabs' ),
        boundaries: {
            top: $s( '.boundary.top' ),
            bottom: $s( '.boundary.bottom' ),
            left: $s( '.boundary.left' ),
            right: $s( '.boundary.right' )
        },
        boundaryActive: ( ) => $s( '.boundary.active' )
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

            styleOverride.innerText += override + ` { background-color: ${ altered } !important; }`;
        }
    }

    //

    const modalOpen = title => {
        UI.modalTitle.innerText = title;
        UI.modalBody.innerHTML = null;
        UI.modalWrapper.classList.add( 'active' );
        return UI.modalBody;
    }

    const modalClose = ( ) => {
        UI.modalWrapper.classList.remove( 'active' );
        activeInstance.activate( );
    }

    UI.modalWrapper.onclick = modalClose;
    UI.modal.onclick = event => event.stopPropagation( );

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
        constructor( target ) {
            this.id = Date.now( );
            this.title = 'Untitled';

            // prepare elements

            this.tabElement = $n( {
                tag: 'div',
                parent: UI.tabs,
                class: 'tab',
                onclick: this.activate
            } );

            this.titleElement = $n( {
                tag: 'span',
                parent: this.tabElement,
                text: this.title
            } );

            this.titleElement.ondblclick = ( ) => {
                this.titleElement.contentEditable = true;
                this.titleElement.focus( );
            }

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

            // addons

            this.fitAddon = new FitAddon( );
            this.terminal.loadAddon( this.fitAddon );

            this.webLinksAddon = new WebLinksAddon( ( _, uri ) => this.linkHandler( uri ) );
            this.terminal.loadAddon( this.webLinksAddon );

            this.terminal.open( this.wrapperElement );

            // transparency injection

            overrideStyle( this.terminal );

            // events

            this.terminal.onData( this.out );
            this.terminal.onTitleChange( this.changeTitle );
            this.terminal.onBell( this.bell );

            // transformations

            const observer = new ResizeObserver( this.resize );
            observer.observe( this.wrapperElement );

            // prepare target

            let cwd = CONFIG.startingDirectory;
            let file;

            const exists = fs.existsSync( target );
            if( exists ) {
                const stat = fs.statSync( target );
                const directory = stat.isDirectory( );

                if( directory ) {
                    cwd = target;
                } else {
                    file = target;
                }
            }

            // initialize

            instances[ this.id ] = this;
            this.initialize( cwd, file );
            this.activate( );
        }
        initialize = async ( cwd, file ) => {
            this.ipc = await send( 'instance', {
                id: this.id,
                shell: CONFIG.shell,
                cwd,
                file,
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
        kill = ( ) => this.ipc.kill( )
    }

    const copySelection = ( ) => {
        const selection = activeInstance?.terminal.getSelection( );
        if( !selection ) return;

        clipboard.writeText( selection );
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

        if( event.key == 'Escape' && UI.modalWrapper.classList.contains( 'active' ) ) {
            modalClose( );
            return;
        }

        // Copy to clipboard
        if( keysDown.compare( [ 'Control', 'Shift', 'C' ] ) ) {
            copySelection( );
            return;
        }
    }

    window.onkeyup = event => {
        const index = keysDown.indexOf( event.key );
        if( index != -1 ) keysDown.splice( index, 1 );

        if( event.key == CONFIG.binds.max ) {
            event.preventDefault( );
            send( 'toggleMax' );
            return;
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
        const modal = modalOpen( 'Enter key combination' );
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
                modalClose( );
            }
        } );
    } );

    const renderBinder = ( bind, parent ) => {
        const item = 'bind' + bind[ 0 ].toUpperCase( ) + bind.slice( 1 );
        const current = CONFIG[ item ];
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
                    CONFIG.binds[ item ] = translated;
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
            fontCache.fonts = fonts;
            fontCache.updated = stamp;
        }
        return fontCache.fonts;
    }

    const KV = ( { label, icon, content }, parent ) => {
        const wrapper = $qn( '.kv', parent );

        const keyWrapper = $qn( '.k', wrapper );
        if( icon ) keyWrapper.innerHTML += icon;
        $qn( 'span', keyWrapper, label );

        const valueElement = $qn( '.v', wrapper );
        if( content ) valueElement.innerHTML = content;
        return valueElement;
    }

    const preferences = async ( ) => {
        const modal = modalOpen( 'Preferences' );
        
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
        const currentFont = fonts.indexOf( CONFIG.font.family );

        buildSelect( {
            options: fonts,
            parent: kvFont,
            selected: currentFont,
            callback: option => {
                const font = fonts[ option ];
                CONFIG.font.family = font;
            }
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
                const directory = await send( 'startingDirectory' );
                if( !directory ) return;
                CONFIG.startingDirectory = directory;
                startingButton.innerText = directory;
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
        instance: target => new Instance( target ),
        kill: ( ) => activeInstance.kill( )
    }, console.error );

    const initialize = async ( ) => {
        setOpacity( CONFIG.opacity );

        btn_preferences.onclick = preferences;
        btn_instance.onclick = ( ) => new Instance( );

        for( const bind in CONFIG.binds ) {
            send( 'bind', {
                name: bind,
                combination: CONFIG.binds[ bind ]
            } )
        }

        send( 'bounding', CONFIG.bounding );

        new Instance( );

        await Fonts( ); // prevent delayed loads
    }

    initialize( );

} )( );