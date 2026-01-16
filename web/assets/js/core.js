( async ( ) => {

    const { Terminal } = require( '@xterm/xterm' );
    const { FitAddon } = require( '@xterm/addon-fit' );
    const { WebLinksAddon } = require( 'xterm-addon-web-links' );
    const { ipcRenderer, clipboard, shell } = require( 'electron' );
    const { getFonts } = require( 'font-list' );
    const fs = require( 'fs' );
    const os = require( 'os' );

    const IPC = require( './ipc.js' );

    // Default configuration

    const DEFAULT_SHELL = process.platform == 'win32' ? 'powershell.exe' : ( process.env.SHELL || ( process.platform == 'darwin' ? '/bin/zsh' : '/bin/bash' ) );

    const DEFAULTS = {
        fontSize: 14,
        fontFamily: 'Consolas, monospace',
        cursor: 'block',
        shell: DEFAULT_SHELL,
        bindToggle: 'F10',
        bindInstance: 'Shift+F10',
        bindKill: 'Control+Shift+F10',
        bindMax: 'F11',
        boundingX: 0,
        boundingY: 0,
        boundingWidth: 1,
        boundingHeight: 0.4,
        startingDirectory: os.homedir( ),
        bindGhost: 'Meta+Control'
    }

    for( const key in DEFAULTS ) {
        if( localStorage.hasOwnProperty( key ) ) continue;
        const value = DEFAULTS[ key ];
        localStorage.setItem( key, value );
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

    // transparency transcoding (xterm.js no longer supports this)
    const mutationObserver = new MutationObserver( mutations => {
        for( const mutation of mutations ) {
            const target = mutation.target;
            if( !target.parentElement?.classList.contains( 'xterm-rows' ) ) continue;
            const background = window.getComputedStyle( target ).backgroundColor;
            const [ r, g, b ] = background.slice( 5, -1 ).split( ', ' );
            if( r - g - b == 0 ) continue;
            // add transparency
            const translucent = `rgba(${ r }, ${ g }, ${ b }, 0.75)`;
            target.style.backgroundColor = translucent;

        }
    } );

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
                fontFamily: localStorage.getItem( 'font' ),
                cursorStyle: localStorage.getItem( 'cursor' ),
                fontSize: localStorage.getItem( 'fontSize' )
            } );

            // custom handlers

            this.terminal.parser.registerOscHandler( 9, data => {
                console.log( data );
                return true;
            } );

            // addons

            this.fitAddon = new FitAddon( );
            this.terminal.loadAddon( this.fitAddon );

            this.webLinksAddon = new WebLinksAddon( ( _, uri ) => this.linkHandler( uri ) );
            this.terminal.loadAddon( this.webLinksAddon );

            this.terminal.open( this.wrapperElement );

            // events

            this.terminal.onData( this.out );
            this.terminal.onTitleChange( this.changeTitle );
            this.terminal.onBell( this.bell );

            // transformations

            const observer = new ResizeObserver( this.resize );
            observer.observe( this.wrapperElement );

            mutationObserver.observe( this.wrapperElement, {
                attributes: true,
                childList: true,
                characterData: true,
                subtree: true
            } );

            // prepare target

            let cwd = localStorage.getItem( 'startingDirectory' ), file;

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
            this.initialize( );
            this.activate( );
        }
        initialize = async ( cwd, file ) => {
            this.ipc = await send( 'instance', {
                id: this.id,
                shell: localStorage.getItem( 'shell' ),
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
            if( dInstances.length == 0 ) {
                new Instance( );
                return;
            }

            dInstances.at( -1 ).activate( );
        }
        kill = ( ) => this.ipc.kill( )
    }

    btn_instance.onclick = ( ) => new Instance( );

    const closeInstance = id => {
        const instance = instances[ id ];
        if( !instance ) return;
        instance.destroy( );
        
        const dInstances = Object.values( instances );
        if( dInstances.length == 0 ) {
            new Instance( );
            return;
        }

        dInstances.at( -1 ).activate( );
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

        if( event.key == 'Escape' && modalWrapper.classList.contains( 'active' ) ) {
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

        if( event.key == localStorage.getItem( 'bindMax' ) ) {
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
        const current = localStorage.getItem( item );
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
                    localStorage.setItem( item, translated );
                    send( 'bind', {
                        name: bind,
                        combination: translated
                    } );
                    preferences( );
                } );
            }
        } );
    }

    const preferences = async ( ) => {
        const modal = modalOpen( 'Preferences' );
        
        const cursorGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-i-cursor"></i><span>Cursor style</span>' );

        buildSelect( {
            options: {
                bar: 'Bar',
                block: 'Block',
                underline: 'Underline'
            },
            parent: cursorGroup,
            selected: localStorage.getItem( 'cursor' ),
            callback: option => localStorage.setItem( 'cursor', option )
        } );

        const fontGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-font"></i><span>Font family</span>' );

        getFonts( ).then( fonts => {
            const currentFont = fonts.indexOf( localStorage.getItem( 'font' ) );

            buildSelect( {
                options: fonts,
                parent: fontGroup,
                selected: currentFont,
                callback: option => {
                    const font = fonts[ option ];
                    localStorage.setItem( 'font', font, ', monospace' );

                    for( const id in instances ) instances[ id ].setFont( font );
                }
            } );
        } );

        const sizeGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-text-width"></i><span>Font size</span>' );

        const fontSizeInput = $n( {
            tag: 'input',
            type: 'number',
            min: 8,
            max: 64,
            value: localStorage.getItem( 'fontSize' ),
            parent: sizeGroup,
            onchange: event => {
                const size = fontSizeInput.value;
                localStorage.setItem( 'fontSize', fontSizeInput.value );

                const font = localStorage.getItem( 'font' );
                for( const id in instances ) instances[ id ].setFont( font, size );
            }
        } );

        const shellGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-terminal"></i><span>Shell</span>' );

        const shellInput = $n( {
            tag: 'input',
            type: 'text',
            value: localStorage.getItem( 'shell' ),
            parent: shellGroup
        } );

        $n( {
            tag: 'button',
            text: 'Apply',
            parent: shellGroup,
            onclick: ( ) => {
                const shell = shellInput.value;
                localStorage.setItem( 'shell', shell );
            }
        } );

        const autoLaunchGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-rocket"></i><span>Automatic launch</span>' );
        const autoLaunchCheck = $n( {
            tag: 'input',
            type: 'checkbox',
            parent: autoLaunchGroup,
            onclick: async ( ) => {
                const result = await send( 'toggleAutoLaunch' );
                autoLaunchCheck.checked = result;
            },
            checked: await send( 'autoLaunch' )
        } );

        const toggleGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-keyboard"></i><span>Toggle bind</span>' );
        renderBinder( 'toggle', toggleGroup );

        const instanceGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-keyboard"></i><span>New instance bind</span>' );
        renderBinder( 'instance', instanceGroup );

        const killGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-keyboard"></i><span>Kill instance bind</span>' );
        renderBinder( 'kill', killGroup );

        const maximizeGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-keyboard"></i><span>Toggle maximize bind</span>' );
        renderBinder( 'max', maximizeGroup );

        const ghostGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-keyboard"></i><span>Ghost bind</span>' );
        renderBinder( 'ghost', ghostGroup );

        const startingGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-folder"></i><span>Starting directory</span>' );
        const startingButton = $n( {
            tag: 'button',
            parent: startingGroup,
            text: localStorage.getItem( 'startingDirectory' ),
            onclick: async ( ) => {
                const directory = await send( 'startingDirectory' );
                localStorage.setItem( 'startingDirectory', directory );
                startingButton.innerText = directory;
            }
        } );

        const authorGroup = $qn( '.input-group', modal, '<i class="fa-solid fa-user"></i><span>Author</span>' );
        $n( {
            tag: 'button',
            text: 'Arty',
            parent: authorGroup,
            onclick: ( ) => shell.openExternal( 'https://www.itzarty.eu' )
        } );
    }

    btn_preferences.onclick = preferences;

    window.onload = async ( ) => {
        const target = process.argv.at( -1 );
        new Instance( );

        send( 'bind', {
            name: 'toggle',
            combination: localStorage.getItem( 'bindToggle' )
        } );
        send( 'bind', {
            name: 'instance',
            combination: localStorage.getItem( 'bindInstance' )
        } );
        send( 'bind', {
            name: 'kill',
            combination: localStorage.getItem( 'bindKill' )
        } );
        send( 'bind', {
            name: 'ghost',
            combination: localStorage.getItem( 'bindGhost' )
        } );

        const bounding = {
            x: localStorage.getItem( 'boundingX' ),
            y: localStorage.getItem( 'boundingY' ),
            width: localStorage.getItem( 'boundingWidth' ),
            height: localStorage.getItem( 'boundingHeight' )
        }

        send( 'bounding', bounding );
        // ipcRenderer.send( 'background' );
    }

    let resizing = false;

    for( const direction in UI.boundaries ) {
        const element = UI.boundaries[ direction ];
        element.onmousedown = event => {
            event.preventDefault( );
            event.stopPropagation( );

            resizing = true;
            send( 'resizeWindow', {
                state: true,
                direction
            } );
            element.classList.add( 'active' );
        }
    }

    window.onmouseup = event => {
        resizing = false;
        send( 'resizeWindow', {
            state: false
        } );
        UI.boundaryActive( )?.classList.remove( 'active' );
    }

    ipcRenderer.on( 'background', async ( event, sources ) => {
        const stream = await navigator.mediaDevices.getUserMedia( {
            audio: false,
            video: {
                mandatory: {
                    chromeMediaSource: 'desktop',
                    chromeMediaSourceId: sources[0],
                    minWidth: 1280,
                    maxWidth: 1920,
                    minHeight: 720,
                    maxHeight: 1080,
                    cursor: 'never'
                }
            }
        } );
        background.srcObject = stream;
        background.onloadedmetadata = ( ) => background.play( );
        const loop = ( ) => {
            background.style.left = -(window.screenLeft * window.devicePixelRatio) + 'px';
            background.style.top = -(window.screenTop * window.devicePixelRatio) + 'px';
            requestAnimationFrame( loop );
        }
        loop( );
    } );

    const { send } = new IPC( ipcRenderer, ipcRenderer, {
        ghost: active => {
            if( active ) {
                UI.container.classList.add( 'ghost' );
                return;
            }
            UI.container.classList.remove( 'ghost' );
            activeInstance.terminal.focus( );
        },
        bounding: ( { x, y, width, height } ) => {
            localStorage.setItem( 'boundingX', x );
            localStorage.setItem( 'boundingY', y );
            localStorage.setItem( 'boundingWidth', width );
            localStorage.setItem( 'boundingHeight', height );
        },
        instance: target => new Instance( target ),
        kill: ( ) => activeInstance.kill( )
    }, console.error );

} )( );