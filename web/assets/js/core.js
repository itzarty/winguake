( async ( ) => {

    const os = require( 'os' );
    const fs = require( 'fs' );
    const IPC = require( './ipc.js' );
    const { getFonts } = require( 'font-list' );

    const { Terminal } = require( '@xterm/xterm' );
    const { FitAddon } = require( '@xterm/addon-fit' );
    const { WebglAddon } = require( '@xterm/addon-webgl' );
    const { SearchAddon } = require( '@xterm/addon-search' );
    const { WebLinksAddon } = require( '@xterm/addon-web-links' );
    const { SerializeAddon } = require( '@xterm/addon-serialize' );

    const { ImageAddon } = require( '@xterm/addon-image' );
    const { ProgressAddon } = require( '@xterm/addon-progress' );
    const { LigaturesAddon } = require( 'xterm-addon-ligatures' );

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
            copy: 'Control+Shift+C',
            details: 'Alt'
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
        palette: -1,
        audio: {
            sink: 'default',
            volume: 1
        },
        history: { }
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
        font: ( ) => Instances.forEach( instance => instance.setFont( CONFIG.font.family, CONFIG.font.size ) ),
        cursor: ( ) => Instances.forEach( instance => instance.terminal.options.cursorStyle = CONFIG.cursor ),
        opacity: ( ) => setOpacity( CONFIG.opacity ),
        palette: ( ) => reloadPalette( ),
        palettes: ( ) => reloadPalette( ),
        audio: {
            volume: ( ) => audioEngine.setVolume( CONFIG.audio.volume ),
            sink: ( ) => audioEngine.setSink( CONFIG.audio.sink )
        }
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
        wrapperGroups: $s( '.wrapper-groups' ),
        tabGroups: $s( '.tab-groups' ),
        boundaries: {
            top: $s( '.boundary.top' ),
            bottom: $s( '.boundary.bottom' ),
            left: $s( '.boundary.left' ),
            right: $s( '.boundary.right' )
        },
        boundaryActive: ( ) => $s( '.boundary.active' ),
        inputbarWrapper: $s( '.inputbar-wrapper' ),
        inputbar: $s( '.inputbar' ),
        inputbarIcon: $s( '.inputbar-icon' ),
        inputbarSuggestions: $s( '.inputbar-suggestions' ),
        inputbarTokens: $s( '.inputbar-tokens' ),
        inputbarHint: $s( '.inputbar-hint' )
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

    const reloadPalette = ( ) => {
        const palette = CONFIG.palette == -1 ? DEFAULT_PALETTE : CONFIG.palettes[ CONFIG.palette ].scheme;
        if( !palette ) {
            CONFIG.palette = -1;
            return;
        }
        for( const instance of Instances ) {
            instance.terminal.options.theme = DEFAULT_PALETTE;
            instance.terminal.options.theme = palette;
        }
    }

    const audioEngine = new AudioEngine( );
    audioEngine.setVolume( CONFIG.audio.volume );
    audioEngine.setSink( CONFIG.audio.sink );
    await audioEngine.load( 'bell', './assets/audio/bell.mp3' );

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
        if( modal.reload ) {
            modal.body.innerHTML = null;
            modal.reload( modal.body );
        }

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

    const modalOpen = ( { title, serial = false, action, icon, reload } ) => {
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
            icon,
            reload
        } );

        modalActivate( );
        return body;
    }

    const modalClose = ( ) => {
        modals.splice( 0 );
        $s( '.modal-body.active' )?.remove( );

        activeInstance.focus( );
    }

    UI.modalClose.onclick = UI.modalWrapper.onclick = modalClose;
    UI.modal.onclick = event => event.stopPropagation( );

    const Groups = [ ];
    let activeGroup = null;

    const Instances = [ ];

    class Group {
        constructor( mode, options ) {
            this.instances = [ ];
            this.activeInstance = null;
            
            this.tabGroupElement = $qn( '.tab-group', UI.tabGroups );
            this.tabElement = $qn( '.tabs', this.tabGroupElement );
            
            if( Groups.length != 0 ) {
                this.separatorElement = $qn( '.wrapper-separator', UI.wrapperGroups );
            }

            let weight = 1;
            if( Groups.length > 0 ) {
                let totalWeight = 0;
                for( const { wrapperElement } of Groups ) {
                    totalWeight += parseFloat( wrapperElement.style.flexGrow || 1 );
                }
                weight = totalWeight / Groups.length;
            }

            this.wrapperElement = $qn( '.wrapper-group', UI.wrapperGroups );
            this.wrapperElement.style.flexGrow = weight;
 
            $n( {
                tag: 'div',
                class: 'btn',
                parent: this.tabGroupElement,
                html: '<i class="fa-solid fa-plus"></i>',
                onclick: event => {
                    if( event.shiftKey ) {
                        new Group( );
                        return;
                    }
                    if( event.ctrlKey ) {
                        instanceMenu( this );
                        return;
                    }
                    new Instance( undefined, undefined, this );
                }
            } );

            this.sortable = new Sortable( this.tabElement, {
                group: 'tabs',
                animation: 150,
                ghostClass: 'ghost',
                draggable: '.tab',
                fallbackOnBody: true,
                swapThreshold: 0.65,
                invertSwap: true,
                onAdd: this.moveHandler
            } );

            Groups.push( this );

            new Instance( mode, options, this );
        }
        moveHandler = event => {
            if( event.from == event.to ) return;
            const instance = Instances.find( instance => instance.tabElement == event.item );
            this.wrapperElement.appendChild( instance.wrapperElement );
            this.add( instance );

            const group = Groups.find( group => group.tabElement == event.from );
            group.remove( instance );

            instance.focus( );
        }
        add( instance ) {
            instance.group = this;
            this.instances.push( instance );
        }
        remove( instance ) {
            const index = this.instances.indexOf( instance );
            this.instances.splice( index, 1 );
            if( this.instances.length == 0 ) {
                if( Groups.length == 1 ) {
                    new Instance( null, null, this );
                } else {
                    this.dispose( );
                }
                return;
            }
            this.focus( this.instances.at( -1 ) );
        }
        dispose( ) {
            const index = Groups.indexOf( this );
            Groups.splice( index, 1 );

            this.sortable.destroy( );

            if( this.separatorElement ) {
                this.separatorElement.remove( );
            } else {
                Groups[ 0 ].separatorElement.remove( );
                delete Groups[ 0 ].separatorElement;
            }
            this.tabGroupElement.remove( );
            this.wrapperElement.remove( );

            if( Groups.length == 0 ) {
                new Group( );
            } else {
                Groups[ 0 ].focus( );
            }
        }
        focus( instance, activate = true ) {
            if( !instance ) {
                instance = this.activeInstance;
            }

            if( activeGroup != this ) {
                activeGroup?.wrapperElement.classList.remove( 'active' );

                activeGroup = this;
                this.wrapperElement.classList.add( 'active' );
            }

            if( this.activeInstance && this.activeInstance != instance ) {
                this.activeInstance.blur( );
            }

            this.activeInstance = instance;
            if( activate ) this.activeInstance.activate( );

            activeInstance = instance;
       }
    }

    let activeInstance;

    class TimestampGutter {
        constructor( terminal ) {
            this.map = new Map( );
            this.terminal = terminal;
            this.screen = $s( this.terminal.element, '.xterm-screen' );

            this.element = $qn( '.gutter', this.screen );

            this.terminal.onLineFeed( ( ) => this.add( ) );
            this.terminal.onRender( ( ) => this.update( ) );
            this.terminal.onScroll( ( ) => this.update( ) );
        }
        add( ) {
            const marker = this.terminal.registerMarker( 0 );
            if( !marker ) return;

            this.map.set( marker.line, new Date( ) );
            marker.onDispose( ( ) => this.map.delete( marker.line ) );
        }
        update( ) {
            const buffer = this.terminal.buffer.active;
            const viewportY = buffer.viewportY;
            const rows = this.terminal.rows;
            this.element.innerHTML = null;

            for( let i = 0; i < rows; i++ ) {
                const index = viewportY + i;
                const line = buffer.getLine( index );

                let string = '';

                if( !line || !line.isWrapped ) {
                    const stamp = this.map.get( index );
                    if( stamp ) string = `${ stamp.getHours( ) }:${ stamp.getMinutes( ) }:${ stamp.getSeconds( ) }:${ stamp.getMilliseconds( ) }`;
                }

                $qn( 'span', this.element, string );
            }
        }
        show( ) {
            this.element.classList.add( 'active' );
        }
        hide( ) {
            this.element.classList.remove( 'active' );
        }
    }

    class Instance {
        constructor( mode, options, group = activeGroup ) {
            this.id = Date.now( );
            this.mode = mode;
            this.options = options;
            this.group = group;

            this.report = { }

            this.readyState = 0;
            this.readyListeners = [ ];

            this.mode ||= 'shell';
            this.options ||= {
                shell: CONFIG.shell,
                cwd: CONFIG.startingDirectory
            }

            switch( this.mode ) {
                case 'ssh':
                    this.title = `${ this.options.username }@${ this.options.host }:${ this.options.port }`;
                    break;
                case 'serial':
                    this.title = `${ this.options.path }@${ this.options.baudRate }`;
                    break;
                case 'shell':
                    this.title = this.options.cwd;
                    break;
                case 'telnet':
                    this.title = `${ this.options.hostname }:${ this.options.port }`;
                    break;
                default:
                    this.title = this.mode;
                    break;
            }

            this.group.add( this );

            // prepare elements

            this.tabElement = $n( {
                tag: 'div',
                parent: this.group.tabElement,
                class: 'tab',
                onclick: this.focus
            } );

            this.progressElement = $qn( '.tab-progress', this.tabElement );
            this.titleWrapper = $qn( '.tab-title', this.tabElement );

            this.titleElement = $n( {
                tag: 'span',
                parent: this.titleWrapper,
                text: this.title,
                tabindex: '0',
                onblur: ( ) => { },
                ondblclick: this.editTitle
            } );

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
                'Set tab title': this.editTitle,
                'Serialize framebuffer': async ( ) => {
                    const data = this.serializeAddon.serialize( );
                    const path = await send( 'saveFile' );
                    fs.writeFile( path, data, ( ) => { } );
                }
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
                    this.changeTitle( this.title );
                    return;
                }
            }

            this.closeElement = $n( {
                tag: 'div',
                class: 'tab-close',
                parent: this.tabElement,
                html: '<i class="fa-solid fa-xmark"></i>',
                onclick: event => {
                    event.stopPropagation( );
                    this.kill( );
                }
            } );

            this.wrapperElement = $qn( '.wrapper', this.group.wrapperElement );
            this.reportElement = $qn( '.report', this.wrapperElement );
            this.loaderElement = $qn( '.loader', this.wrapperElement, '<i class="fa-solid fa-circle-notch"></i>' );

            // terminal configuration

            this.terminal = new Terminal( {
                cursorBlink: true,
                fontFamily: CONFIG.font.family,
                cursorStyle: CONFIG.cursor,
                fontSize: CONFIG.font.size,
                allowProposedApi: true
            } );

            const palette = CONFIG.palette == -1 ? DEFAULT_PALETTE : CONFIG.palettes[ CONFIG.palette ].scheme;
            this.terminal.options.theme = palette;

            this.terminal.options.theme.background = '#00000000';

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

            this.serializeAddon = new SerializeAddon( );
            this.terminal.loadAddon( this.serializeAddon );

            this.imageAddon = new ImageAddon( );
            this.terminal.loadAddon( this.imageAddon );

            this.progressAddon = new ProgressAddon( );
            this.terminal.loadAddon( this.progressAddon );

            this.ligaturesAddon = new LigaturesAddon( );

            this.terminal.open( this.wrapperElement );

            this.terminal.parser.registerOscHandler( 7, console.log ); // CWD
            this.terminal.parser.registerOscHandler( 52, console.log ); // Clipboard
            this.terminal.parser.registerOscHandler( 133, console.log ); // I/O/P
            this.terminal.parser.registerOscHandler( 1337, console.log ); // State

            this.progressAddon.onChange( ( { state, value } ) => {
                if( state == 0 ) { // -nothing-
                    this.progressElement.classList.remove( 'marquee' );
                    this.progressElement.classList.remove( 'paused' );
                    this.progressElement.classList.remove( 'active' );
                    return;
                }
                this.progressElement.classList.add( 'active' );
                if( state == 1 ) {
                    this.progressElement.style.width = value + '%';
                    return;
                }
                if( state == 2 ) { // error
                    this.progressElement.classList.add( 'error' );
                    return;
                }
                if( state == 3 ) { // indeterminate
                    this.progressElement.classList.add( 'marquee' );
                    return;
                }
                if( state == 4 ) { // warning/paused
                    this.progressElement.classList.add( 'paused' );
                    return;
                }
            } );

            this.terminal.loadAddon( this.ligaturesAddon );
            this.timestampGutter = new TimestampGutter( this.terminal );

            // transparency injection (not supported with webgl)

            if( !CONFIG.webgl ) {
                overrideStyle( this.terminal );
            }

            // events

            this.terminal.onTitleChange( this.changeTitle );
            this.terminal.onBell( this.bell );

            this.terminal.attachCustomWheelEventHandler( event => {
                if( !event.ctrlKey ) return;
                const delta = event.deltaY > 0 ? 1 : -1;
                const size = this.terminal.options.fontSize + delta;
                if( size < 8 || size > 64 ) return;
                this.setFont( false, size );
            } );

            this.terminal.element.addEventListener( 'click', ( ) => {
                this.focus( false );
            } );

            this.terminal.attachCustomKeyEventHandler( event => {
                this.focus( false );

                if( !event.ctrlKey ) return;
                if( event.key == '+' ) {
                    const size = this.terminal.options.fontSize + 1;
                    if( size > 64 ) return;
                    this.setFont( false, size );
                }
                if( event.key == '-' ) {
                    const size = this.terminal.options.fontSize - 1;
                    if( size < 8 ) return;
                    this.setFont( false, size );
                }
            } );

            // transformations

            const observer = new ResizeObserver( this.resize );
            observer.observe( this.wrapperElement );

            // initialize

            Instances.push( this );
            this.initialize( );
            this.focus( );
        }
        initialize = async ( ) => {
            this.ipc = await send( 'instance', {
                id: this.id,
                mode: this.mode,
                options: this.options,
                announce: this.announce,
                write: data => this.in( data ),
                exit: reason => {
                    console.log( reason );
                    this.destroy( );
                },
                ready: ( ) => {
                    this.terminal.onData( this.out );
                    this.ready( ); // Interface ready
                }
            } );
            this.ready( ); // IPC ready
        }
        ready = callback => {
            if( !callback ) {
                this.readyState++;
                if( this.readyState != 2 ) return; // IPC & Interface ready
                this.resize( );
                animOut( this.loaderElement );
                for( const callback of this.readyListeners ) callback( );

                const date = new Date( );
                const datetime = `${ date.getDate( ) }. ${ date.getMonth( ) + 1 }. ${ date.getFullYear( ) } @ ${ date.getHours( ).toString( ).padStart( 2, '0' ) }:${ date.getMinutes( ).toString( ).padStart( 2, '0' ) }:${ date.getSeconds( ).toString( ).padStart( 2, '0' ) }`;
                this.announce( 'Initialized', datetime );
                return;
            }
            this.readyListeners.push( callback );
        }
        announce = ( issue, value ) => {
            this.report[ issue ] = value;

            this.reportElement.innerHTML = null;
            for( const issue in this.report ) {
                const value = this.report[ issue ];
                $qn( 'span', this.reportElement, `${ issue }: ${ value }` );
            }
        }
        linkHandler = uri => {
            shell.openExternal( uri );
        }
        in = data => this.terminal.write( data )
        out = data => {
            if( !this.ipc ) return;
            this.ipc.write( data )
        }
        changeTitle = ( title = 'Untitled' ) => {
            this.title = title.split( '\\' ).at( -1 );

            // title template
            let finalTitle;
            if( this.customTitle ) {
                finalTitle = this.customTitle.replaceAll( '%t', this.title );
            } else {
                finalTitle = this.title;
            }

            this.titleElement.innerText = finalTitle;

            const duplicates = Instances.filter( instance => instance.title == this.title );
            if( duplicates.length == 1 ) return;

            const ordered = duplicates.sort( ( a, b ) => a.id - b.id );
            for( let i = 0; i < ordered.length; i++ ) {
                ordered[ i ].titleElement.innerText = this.title + ` (${ i + 1 })`
            }
        }
        editTitle = ( ) => {
            this.titleElement.contentEditable = true;
            this.titleElement.setAttribute( 'tabindex', '0' );
            this.titleElement.focus( );
        }
        changeColor = color => this.tabElement.style.backgroundColor = color ? color + '4f' : ''
        bell = ( ) => {
            audioEngine.play( 'bell' );
            if( activeInstance != this ) this.tabElement.classList.add( 'bell' );
        }
        blur = ( ) => {
            this.tabElement.classList.remove( 'active' );
            this.wrapperElement.classList.remove( 'active' );
            this.terminal.blur( );
        }
        focus = activate => {
            this.group.focus( this, activate );
        }
        activate = ( ) => {
            activeInstance = this; // legacy

            this.tabElement.classList.add( 'active' );
            this.wrapperElement.classList.add( 'active' );
            this.terminal.focus( );

            this.tabElement.classList.remove( 'bell' );
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
            if( family ) this.terminal.options.fontFamily = family;
            if( size ) this.terminal.options.fontSize = size;

            this.resize( );
        }
        destroy = ( ) => {
            this.terminal.dispose( );
            animOut( this.tabElement );
            this.wrapperElement.remove( );

            const index = Instances.indexOf( this.id );
            Instances.splice( index, 1 );

            this.group.remove( this );

            for( const instance of Instances ) {
                if( !instance.title ) return; // lingering instances
                instance.changeTitle( instance.title );
            }
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
            UI.inputbarWrapper.classList.remove( 'active' );
            activeInstance.terminal.focus( );
            return;
        }

        const combination = keysDown.join( '+' );

        // Copy to clipboard
        if( combination == CONFIG.binds.copy ) {
            const selection = activeGroup.activeInstance.terminal.getSelection( );
            if( !selection ) return;

            clipboard.writeText( selection );
            return;
        }

        // Timestamps
        if( combination == CONFIG.binds.details ) {
            activeInstance.timestampGutter.show( );
            activeInstance.reportElement.classList.add( 'active' );
            return;
        }

        // Omnibox
        if( combination == CONFIG.binds.omnibox ) {
            omnibox( );
            return;
        }

        // Search
        if( combination == CONFIG.binds.search ) {
            search( );
            return;
        }
    }

    window.onkeyup = event => {
        const combination = keysDown.join( '+' );

        // Timestamps
        if( combination == CONFIG.binds.details ) {
            activeInstance.timestampGutter.hide( );
            activeInstance.reportElement.classList.remove( 'active' );
            return;
        }

        const index = keysDown.indexOf( event.key );
        if( index != -1 ) keysDown.splice( index, 1 );
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

    const editPalette = id => {
        modalOpen( {
            title: 'Palette editor',
            serial: true,
            action: ( ) => {
                CONFIG.palettes[ id ] = palette;
            },
            icon: '<i class="fa-solid fa-floppy-disk"></i>',
            reload: modal => {
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
        } );
    }

    const paletteMenu = ( ) => {
        modalOpen( {
            title: 'Terminal palette',
            serial: true,
            reload: modal => {
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
        } );
    }

    const executePreset = id => {
        const preset = CONFIG.presets[ id ];
        if( !preset ) {
            alert();
            return;
        }
        const instance = new Instance( preset.mode, preset.options );
        instance.changeTitle( preset.tabTitle );
        instance.changeColor( preset.tabColor );
        instance.ready( ( ) => {
            instance.ipc.write( preset.script );
        } );
    }

    const editPreset = id => {
        const preset = CONFIG.presets[ id ];

        let script = preset.script;
        let title = preset.title;
        let bind = preset.bind;
        let tabTitle = preset.tabTitle;
        let tabColor = preset.tabColor;

        let result = {
            mode: preset.mode,
            options: preset.options
        }

        const modal = modalOpen( {
            title: 'Edit preset',
            serial: true,
            action: ( ) => {
                CONFIG.presets[ id ] = {
                    ... result,
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

        ConfigBuilder( [
            {
                label: 'Title',
                icon: '<i class="fa-solid fa-pencil"></i>',
                type: 'text',
                value: title,
                callback: text => title = text
            },
            {
                label: 'Tab title',
                icon: '<i class="fa-solid fa-heading"></i>',
                type: 'text',
                value: tabTitle,
                callback: text => tabTitle = text
            },
            {
                label: 'Tab color',
                icon: '<i class="fa-solid fa-palette"></i>',
                type: 'color',
                value: tabColor,
                callback: color => tabColor = color
            },
            {
                label: 'Keyboard shortcut',
                icon: '<i class="fa-solid fa-keyboard"></i>',
                type: 'button',
                html: bind,
                callback: element => {
                    getKeyCombination( ).then( combination => {
                        const translated = combination.join( '+' );
                        bind = element.innerText = translated;
                    } );
                }
            }
        ], modal );

        result = presetBuilder( modal, result.mode, result.options );

        const scriptElement = $n( {
            tag: 'textarea',
            parent: modal,
            text: script,
            oninput: ( ) => script = scriptElement.value
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
        
        const fonts = await Fonts( );
        const sinks = arrMap( await audioEngine.sinks( ), 'deviceId', 'label' );

        ConfigBuilder( [
            {
                label: 'Appearance',
                type: 'section'
            },
            {
                label: 'Cursor style',
                icon: '<i class="fa-solid fa-i-cursor"></i>',
                type: 'select',
                options: {
                    bar: 'Bar',
                    block: 'Block',
                    underline: 'Underline'
                },
                selected: CONFIG.cursor,
                callback: option => CONFIG.cursor = option
            },
            {
                label: 'Font family',
                icon: '<i class="fa-solid fa-font"></i>',
                type: 'select',
                options: fonts,
                selected: CONFIG.font.family,
                callback: option => CONFIG.font.family = option
            },
            {
                label: 'Font size',
                icon: '<i class="fa-solid fa-text-width"></i>',
                type: 'number',
                min: 8,
                max: 64,
                value: CONFIG.font.size,
                callback: size => CONFIG.font.size = size
            },
            {
                label: 'Terminal opacity',
                icon: '<i class="fa-solid fa-circle-half-stroke"></i>',
                type: 'range',
                min: 0,
                max: 1,
                step: 0.01,
                value: CONFIG.opacity,
                callback: opacity => CONFIG.opacity = Number( opacity )
            },
            {
                label: 'Terminal palette',
                icon: '<i class="fa-solid fa-palette"></i>',
                type: 'button',
                html: '<i class="fa-solid fa-angle-right"></i>',
                callback: paletteMenu
            },
            {
                label: 'Presets',
                icon: '<i class="fa-solid fa-file-lines"></i>',
                type: 'button',
                html: '<i class="fa-solid fa-angle-right"></i>',
                callback: presetsMenu
            },
            {
                label: 'Behavior',
                type: 'section'
            },
            {
                label: 'Shell',
                icon: '<i class="fa-solid fa-terminal"></i>',
                modules: [
                    {
                        type: 'text',
                        value: CONFIG.shell
                    },
                    {
                        type: 'button',
                        html: '<i class="fa-solid fa-check"></i>',
                        callback: ( input, triggered ) => {
                            if( !input || !triggered ) return;
                            CONFIG.shell = input;
                        }
                    }
                ]
            },
            {
                label: 'Run on startup',
                icon: '<i class="fa-solid fa-rocket"></i>',
                type: 'switch',
                callback: async ( ) => {
                    const result = await send( 'toggleAutoLaunch' );
                    autoLaunchCheck.checked = result;
                },
                checked: await send( 'autoLaunch' )
            },
            {
                label: 'Starting directory',
                icon: '<i class="fa-solid fa-folder"></i>',
                type: 'button',
                html: CONFIG.startingDirectory,
                    callback: async ( ) => {
                    const directory = await send( 'selectDirectory' );
                    if( !directory ) return;
                    CONFIG.startingDirectory = directory;
                }
            },
            {
                label: 'Accelerated terminal rendering',
                tooltip: 'Accelerates terminal rendering using WebGL',
                icon: '<i class="fa-solid fa-folder"></i>',
                type: 'switch',
                callback: state => CONFIG.webgl = state,
                checked: CONFIG.webgl
            },
            {
                label: 'Volume',
                icon: '<i class="fa-solid fa-volume-high"></i>',
                type: 'range',
                min: 0,
                max: 1,
                step: 0.01,
                value: CONFIG.audio.volume,
                callback: volume => CONFIG.audio.volume = Number( volume )
            },
            {
                label: 'Audio output',
                icon: '<i class="fa-solid fa-headphones"></i>',
                type: 'select',
                options: sinks,
                selected: CONFIG.audio.sink,
                callback: sink => CONFIG.audio.sink = sink
            },
            {
                label: 'Position & scale',
                type: 'section'
            },
            {
                label: 'Width',
                icon: '<i class="fa-solid fa-arrows-left-right"></i>',
                type: 'range',
                min: 0.1,
                max: 1,
                step: 0.01,
                value: CONFIG.bounding.width,
                callback: width => {
                    CONFIG.bounding.width = Number( width );
                    send( 'bounding', CONFIG.bounding );
                }
            },
            {
                label: 'Height',
                icon: '<i class="fa-solid fa-arrows-up-down"></i>',
                type: 'range',
                min: 0.1,
                max: 1,
                step: 0.01,
                value: CONFIG.bounding.height,
                callback: height => {
                    CONFIG.bounding.height = Number( height );
                    send( 'bounding', CONFIG.bounding );
                }
            },
            {
                label: 'Top offset',
                icon: '<i class="fa-solid fa-arrow-down"></i>',
                type: 'range',
                min: 0,
                max: 0.9,
                step: 0.01,
                value: CONFIG.bounding.y,
                callback: y => {
                    CONFIG.bounding.y = Number( y );
                    send( 'bounding', CONFIG.bounding );
                }
            },
            {
                label: 'Left offset',
                icon: '<i class="fa-solid fa-arrow-right"></i>',
                type: 'range',
                min: 0,
                max: 0.9,
                step: 0.01,
                value: CONFIG.bounding.x,
                callback: x => {
                    CONFIG.bounding.x = Number( x );
                    send( 'bounding', CONFIG.bounding );
                }
            },
            {
                label: 'Keyboard shortcuts',
                type: 'section'
            }
        ], modal );

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
            icon: '<i class="fa-solid fa-wand-magic-sparkles"></i>'
        }, modal );
        renderBinder( 'omnibox', kvOmnibox );

        const kvDetails = KV( {
            label: 'Show details',
            icon: '<i class="fa-solid fa-info"></i>'
        }, modal );
        renderBinder( 'details', kvDetails );

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
                    options.cwd = target;
                } else {
                    options.file = target;
                }
            }
            new Instance( 'shell', options );
        },
        kill: ( ) => activeInstance.kill( )
    }, console.error );

    window.onfocus = ( ) => {
        keysDown.splice( 0, keysDown.length );
        activeInstance.terminal.focus( );
    }

    const constructPresetBuilder = ( wrapper, result ) => {
        wrapper.innerHTML = null;
        switch( result.mode ) {
            case 'shell':
                ConfigBuilder( [
                    {
                        label: 'Shell',
                        icon: '<i class="fa-solid fa-terminal"></i>',
                        type: 'text',
                        value: result.options.shell,
                        callback: shell => result.options.shell = shell
                    },
                    {
                        label: 'Working directory',
                        icon: '<i class="fa-solid fa-folder"></i>',
                        type: 'button',
                        html: result.options.cwd,
                        callback: async element => {
                            const directory = await send( 'selectDirectory' );
                            if( !directory ) return;
                            result.options.cwd = directory;
                            element.innerText = directory;
                        }
                    }
                ], wrapper );
                break;
            case 'ssh':
                ConfigBuilder( [
                    {
                        label: 'Host',
                        icon: '<i class="fa-solid fa-server"></i>',
                        type: 'text',
                        value: result.options.host,
                        callback: host => result.options.host = host
                    },
                    {
                        label: 'Port',
                        icon: '<i class="fa-solid fa-hashtag"></i>',
                        type: 'number',
                        value: result.options.port,
                        callback: port => result.options.port = port
                    },
                    {
                        label: 'Username',
                        icon: '<i class="fa-solid fa-user"></i>',
                        type: 'text',
                        value: result.options.username,
                        callback: username => result.options.username = username
                    },
                    {
                        label: 'Password',
                        icon: '<i class="fa-solid fa-key"></i>',
                        type: 'text',
                        value: result.options.password,
                        callback: password => result.options.password = password
                    }
                ], wrapper );
                break;
            case 'serial':
                send( 'serialDevices' ).then( devices => {
                    const deviceList = devices.map( device => device.path );
                    ConfigBuilder( [
                        {
                            label: 'Device',
                            icon: '<i class="fa-solid fa-plug"></i>',
                            type: 'select',
                            options: deviceList,
                            value: result.options.path,
                            callback: path => result.options.path = path
                        },
                        {
                            label: 'Baudrate',
                            icon: '<i class="fa-solid fa-clock-rotate-left"></i>',
                            type: 'number',
                            value: result.options.baudRate,
                            callback: baudRate => result.options.baudRate = baudRate
                        }
                    ], wrapper );
                } );
                break;
            case 'telnet':
                ConfigBuilder( [
                    {
                        label: 'Host',
                        icon: '<i class="fa-solid fa-server"></i>',
                        type: 'text',
                        value: result.options.host,
                        callback: host => result.options.host = host
                    },
                    {
                        label: 'Port',
                        icon: '<i class="fa-solid fa-hashtag"></i>',
                        type: 'number',
                        value: result.options.port,
                        callback: port => result.options.port = port
                    }
                ], wrapper );
                break;
        }
    }

    const presetBuilder = ( parent, mode = 'shell', options = PRESET_DEFAULTS[ mode ] ) => {
        const result = {
            mode,
            options
        }

        ConfigBuilder( [
            {
                label: 'Mode',
                icon: '<i class="fa-solid fa-square-binary"></i>',
                type: 'select',
                options: {
                    shell: 'Shell',
                    ssh: 'SSH',
                    serial: 'Serial',
                    telnet: 'Telnet'
                },
                selected: result.mode,
                callback: mode => {
                    result.mode = mode;
                    result.options = PRESET_DEFAULTS[ result.mode ];
                    constructPresetBuilder( optionsWrapper, result )
                }
            }
        ], parent )

        const optionsWrapper = $qn( '.w.v', parent );
        constructPresetBuilder( optionsWrapper, result );
        return result;
    }

    const instanceMenu = group => {
        const modal = modalOpen( {
            title: 'New instance'
        } );

        const result = presetBuilder( modal );

        $n( {
            tag: 'button',
            parent: modal,
            text: 'Start instance',
            onclick: ( ) => {
                modalClose( );
                new Instance( result.mode, result.options, group );
            }
        } );
    }

    let info;
    const initialize = async ( ) => {
        info = await send( 'initialize' );

        setOpacity( CONFIG.opacity );

        for( const bind in CONFIG.binds ) {
            send( 'bind', {
                name: bind,
                combination: CONFIG.binds[ bind ]
            } )
        }

        send( 'bounding', CONFIG.bounding );

        btn_preferences.onclick = preferences;

        new Group( 'shell', {
            shell: CONFIG.shell,
            cwd: info.target
        } );

        await Fonts( ); // prevent delayed loads

        for( const id in CONFIG.presets ) {
            const preset = CONFIG.presets[ id ];
            send( 'presetBind', {
                combination: preset.bind,
                id,
                callback: ( ) => executePreset( id )
            } );
        }
    }

    initialize( );

    const resizing = [ ];

    window.addEventListener( 'mousedown', event => {
        const target = event.target;
        if( !target.classList.contains( 'wrapper-separator' ) ) return;

        const groupA = target.previousElementSibling;
        const groupB = target.nextElementSibling;

        const index = $a( '.wrapper-group' ).indexOf( groupA );
        const tabs = $a( '.tab-group' );

        const [ tabA, tabB ] = tabs.slice( index, index + 2 );

        resizing.push( groupA, groupB, tabA, tabB );
    } );

    window.addEventListener( 'mousemove', event => {
        if( resizing.length != 4 ) return;

        const [ groupA, groupB, tabA, tabB ] = resizing;

        const rectA = groupA.getBoundingClientRect( );
        const sepWidth = groupA.nextElementSibling.offsetWidth;

        const sharedWidth = groupA.offsetWidth + groupB.offsetWidth;
        const relativeX = event.clientX - rectA.left;
        const adjustedX = relativeX - ( sepWidth / 2 );

        const ratioA = clamp( adjustedX / sharedWidth, 0.25, 0.75 );
        const ratioB = 1 - ratioA;

        const weightA = parseFloat( groupA.style.flexGrow || 1 );
        const weightB = parseFloat( groupB.style.flexGrow || 1 );
        const sharedWeight = weightA + weightB;

        const targetWeightA = ratioA * sharedWeight;
        const targetWeightB = ratioB * sharedWeight;

        groupA.style.flexGrow = tabA.style.flexGrow = targetWeightA;
        groupB.style.flexGrow = tabB.style.flexGrow = targetWeightB;
    } );

    window.addEventListener( 'mouseup', ( ) => {
        if( resizing.length == 0 ) return;
        resizing.splice( 0, 4 );
        activeInstance.terminal.focus( );
    } );

    const animOut = element => {
        element.classList.add( 'out' );
        element.onanimationend = ( ) => element.remove( );
    }

    const search = ( ) => {
        UI.inputbarIcon.innerHTML = '<i class="fa-solid fa-magnifying-glass"></i>';
        UI.inputbarWrapper.classList.add( 'active' );
        UI.inputbar.placeholder = 'Search for anything...';
        UI.inputbar.type = 'text';
        UI.inputbar.focus( );

        UI.inputbar.onkeyup = event => {
            const value = UI.inputbar.value;
            if( event.shiftKey && event.key == 'Enter' ) {
                activeGroup.activeInstance.searchAddon.findPrevious( value );
                return;
            }
            if( event.key == 'Enter' ) {
                activeGroup.activeInstance.searchAddon.findNext( value );
                return;
            }
            activeGroup.activeInstance.searchAddon.findNext( value );
        }
    }

    const commands = [
        {
            title: 'ssh',
            handler: ( host, port, username, password ) => {
                new Instance( 'ssh', { host, port, username, password } );
            },
            components: [
                { 
                    title: 'Hostname',
                    type: 'text',
                    default: '127.0.0.1',
                    icon: '<i class="fa-solid fa-server"></i>'
                },
                { 
                    title: 'Port',
                    type: 'number',
                    default: 22,
                    icon: '<i class="fa-solid fa-hashtag"></i>'
                },
                { 
                    title: 'Username',
                    type: 'text',
                    default: 'root',
                    icon: '<i class="fa-solid fa-user"></i>'
                },
                {
                    title: 'Password',
                    type: 'password',
                    icon: '<i class="fa-solid fa-lock"></i>'
                }
            ]
        },
        {
            title: 'serial',
            handler: ( path, baudRate ) => {
                new Instance( 'serial', { path, baudRate } );
            },
            components: [
                {
                    title: 'Port',
                    type: 'number',
                    default: 1,
                    icon: '<i class="fa-solid fa-hashtag"></i>'
                },
                {
                    title: 'Baudrate',
                    type: 'number',
                    default: 9600,
                    icon: '<i class="fa-solid fa-wave-square"></i>'
                }
            ]
        },
        {
            title: 'shell',
            handler: ( shell, cwd ) => {
                new Instance( 'shell', { shell, cwd } );
            },
            components: [
                {
                    title: 'Shell',
                    type: 'text',
                    default: CONFIG.shell,
                    icon: '<i class="fa-solid fa-terminal"></i>'
                },
                {
                    title: 'Working directory',
                    type: 'text',
                    default: CONFIG.startingDirectory,
                    icon: '<i class="fa-solid fa-folder-tree"></i>'
                }
            ]
        }
    ];

    const fuse = new Fuse( commands, {
        keys: [ 'title' ],
        threshold: 0.4
    } );

    const omnibox = ( ) => {
        UI.inputbarIcon.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
        UI.inputbarWrapper.classList.add( 'active' );
        UI.inputbar.placeholder = 'What shall we do?';
        UI.inputbar.spellcheck = false;
        UI.inputbar.value = '';
        UI.inputbar.type = 'text';
        UI.inputbar.focus( );

        let activeCommand = null;
        let argsStack = [ ];
        let suggestionIndex = 0;

        const suggestions = [ ];

        const updateUI = ( ) => {
            UI.inputbarTokens.innerHTML = null;

            if( activeCommand ) {
                $n( {
                    tag: 'span',
                    class: 'inputbar-token',
                    text: activeCommand.title,
                    parent: UI.inputbarTokens
                } )
            }

            for( let i = 0; i < argsStack.length; i++ ) {
                const arg = argsStack[ i ];
                const comp = activeCommand.components[ i ];

                $qn( 'span.inputbar-token', UI.inputbarTokens, ( comp && comp.type == 'password' ) ? '****' : arg );
            }

            if( activeCommand ) {
                const nextIndex = argsStack.length;
                const nextComponent = activeCommand.components[ nextIndex ];

                if( nextComponent ) {
                    UI.inputbar.type = nextComponent.type == 'password' ? 'password' : 'text';
                    UI.inputbar.placeholder = nextComponent.title + ( nextComponent.default ? ` (Default: ${ nextComponent.default })` : '' );
                    UI.inputbarHint.innerHTML = `<i class="fa-solid fa-arrow-left"></i> Enter ${ nextComponent.title }`;
                    UI.inputbarIcon.innerHTML = nextComponent.icon;

                    generateArgSuggestions( nextComponent, UI.inputbar.value );
                } else {
                    UI.inputbar.type = 'text';
                    UI.inputbar.placeholder = 'Press Enter to execute';
                    UI.inputbarHint.innerHTML = 'Ready';
                    UI.inputbarSuggestions.innerHTML = null;
                    suggestions.splice( 0, suggestions.length );
                }
            } else {
                UI.inputbar.type = 'text';
                UI.inputbar.placeholder = 'What shall we do?';
                UI.inputbarIcon.innerHTML = '<i class="fa-solid fa-wand-magic-sparkles"></i>';
                UI.inputbarSuggestions.innerHTML = null;
                UI.inputbarHint.innerHTML = null;
            }
        }

        const renderSuggestions = ( items, type = 'command' ) => {
            UI.inputbarSuggestions.innerHTML = null;
            suggestions.splice( 0, suggestions.length );
            suggestionIndex = 0;

            for( let i = 0; i < items.length; i++ ) {
                const item = items[ i ];
                const element = $n( {
                    tag: 'div',
                    class: 'inputbar-suggestion',
                    parent: UI.inputbarSuggestions,
                    onmousedown: event => {
                        event.preventDefault( );
                        acceptSuggestion( i );
                    }
                } );

                if( i == 0 ) element.classList.add( 'active' );

                if( type == 'command' ) {
                    const argsPreview = item.components.map( component => `[${ component.title }]` ).join( ' ' );
                    element.innerHTML = `<div><span>${ item.title } ${ argsPreview }</span></div>`;
                    suggestions.push( {
                        element,
                        value: item,
                        type: 'command'
                    } );
                } else {
                    element.innerText = item.value;
                    suggestions.push( {
                        element,
                        value: item.value,
                        type: 'value'
                    } );
                }
            }
        }

        const generateArgSuggestions = ( component, currentInput ) => {
            let options = [ ];
            if( component.default != undefined ) {
                options.push( {
                    value: String( component.default ),
                    isDefault: true
                } );
            }
            const history = CONFIG.history[ component.title ] || [ ];
            for( const entry of history ) {
                if( String( entry ) != String( component.default ) ) {
                    options.push( {
                        value: String( entry ),
                        isHistory: true
                    } );
                }
            }

            if( currentInput ) options = options.filter( option => option.value.toLowerCase( ).includes( currentInput.toLowerCase( ) ) );
            if( options.length > 0 ) {
                renderSuggestions( options, 'value' );
                return;
            }
            UI.inputbarSuggestions.innerHTML = null;
            suggestions.splice( 0, suggestions.length );
        }

        const acceptSuggestion = index => {
            if( !suggestions.length ) return;
            const item = suggestions[ index ];
            if( item.type != 'command' ) {
                pushArgument( item.value );
                return;
            }
            activeCommand = item.value;
            UI.inputbar.value = '';
            updateUI( );
        }

        const pushArgument = value => {
            argsStack.push( value );
            UI.inputbar.value = null;
            updateUI( );
        }

        UI.inputbar.oninput = event => {
            const value = UI.inputbar.value;
            if( activeCommand ) {
                const currentComponent = activeCommand.components[ argsStack.length ];
                if( currentComponent ) generateArgSuggestions( currentComponent, value );
                return;
            }
            if( value.trim( ) == '' ) {
                UI.inputbarSuggestions.innerHTML = null;
                suggestions.splice( 0, suggestions.length );
                return;
            }
            const result = fuse.search( value ).map( result => result.item );
            renderSuggestions( result, 'command' );
        }

        UI.inputbar.onkeydown = event => {
            switch( event.key ) {
                case 'ArrowUp':
                case 'ArrowDown':
                    event.preventDefault( );
                    if( suggestions.length == 0 ) break;

                    suggestions[ suggestionIndex ].element.classList.remove( 'active' );
                    if( event.key == 'ArrowUp' ) suggestionIndex = ( suggestionIndex - 1 + suggestions.length ) % suggestions.length;
                    if( event.key == 'ArrowDown' ) suggestionIndex = ( suggestionIndex + 1 ) % suggestions.length;
                    suggestions[ suggestionIndex ].element.classList.add( 'active' );
                    break;
                case ' ':
                    if( !activeCommand ) {
                        if( suggestions.length > 0 ) {
                            event.preventDefault( );
                            acceptSuggestion( suggestionIndex );
                        }
                    } else {
                        if( UI.inputbar.value.trim( ) != '' ) {
                            event.preventDefault( );
                            pushArgument( UI.inputbar.value );
                        }
                    }
                    break;
                case 'Enter':
                    event.preventDefault( );

                    if( !activeCommand ) {
                        if( suggestions.length > 0 ) acceptSuggestion( suggestionIndex );
                        break;
                    }

                    const ready = argsStack.length == activeCommand.components.length;
                    if( ready ) {
                        for( let i = 0; i < argsStack.length; i++ ) {
                            const value = argsStack[ i ];
                            const component = activeCommand.components[ i ];
                            if( component.type == 'password' ) continue;
                            const key = component.title;
                            if( !CONFIG.history[ key ] ) CONFIG.history[ key ] = [ ];
                            if( !CONFIG.history[ key ].includes( value ) ) CONFIG.history[ key ].push( value );
                        }
                        activeCommand.handler( ... argsStack );
                        UI.inputbarWrapper.classList.remove( 'active' );
                        activeCommand = null;
                        argsStack = [ ];
                        updateUI( );
                        break;
                    }

                    if( suggestions.length > 0 ) {
                        acceptSuggestion( suggestionIndex );
                    } else if( UI.inputbar.value.trim( ) != '' ) {
                        pushArgument( UI.inputbar.value );
                    }
                    break;
                case 'Backspace':
                    if( UI.inputbar.value != '' ) break;
                    if( argsStack.length > 0 ) {
                        event.preventDefault( );
                        const value = argsStack.pop( );
                        UI.inputbar.value = value;
                        updateUI( );
                    } else if( activeCommand ) {
                        event.preventDefault( );
                        activeCommand = null;
                        updateUI( );
                    }
                    break;
            }
        }

        updateUI( );
    }

} )( );