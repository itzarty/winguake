( async ( ) => {

    const {
        app,
        BrowserWindow,
        screen,
        ipcMain,
        shell,
        Tray,
        Menu,
        nativeImage,
        dialog
    } = require( 'electron' );
    const path = require( 'path' );
    const pty = require( 'node-pty' );
    const AutoLaunch = require( 'auto-launch' );
    const { UiohookKey, uIOhook } = require( 'uiohook-napi' );

    const IPC = require( './web/ipc.js' );

    await app.whenReady( );

	const singleInstance = app.requestSingleInstanceLock( );
	if( !singleInstance ) {
		app.quit( );
		return;
	}

    const window = new BrowserWindow( {
        webPreferences: {
            contextIsolation: false,
            nodeIntegration: true
        },
        frame: false,
        alwaysOnTop: true,
        autoHideMenuBar: true,
        show: false,
        skipTaskbar: true,
        transparent: true
    } );

    const instances = { };

    const quit = ( ) => {
        window.hide( );
        for( const instance of Object.values( instances ) ) {
            try {
                instance.kill( );
            } catch( error ) {
                console.error( 'Could not kill a running PTY', error );
            }
        }
        window.close( );
    }

    const icon = nativeImage.createFromPath( path.join( __dirname, 'icon.png' ) );
    const tray = new Tray( icon );
    tray.setToolTip( 'WinGuake' );
    const contextMenu = Menu.buildFromTemplate( [
        {
            label: 'WinGauke',
            enabled: false
        },
        {
            type: 'separator'
        },
        {
            label: 'Quit',
            click: ( ) => quit( )
        }
    ] );
    tray.setContextMenu( contextMenu );

    window.loadFile( 'web/index.html' );

    let multipliers = { x: 0, y: 0, height: 0.5, width: 1 }

    const show = ( ) => {
        const cursor = screen.getCursorScreenPoint( );
        const display = screen.getDisplayNearestPoint( cursor );

        const { x, y, width, height } = display.workArea;

        window.setBounds( {
            x: x + ( width * multipliers.x ),
            y: y + ( height * multipliers.y ),
            width: width * multipliers.width,
            height: height * multipliers.height
        } );

        window.setSize( Math.floor( width * multipliers.width ), Math.floor( height * multipliers.height ) );

        window.show( );
        window.focus( );
    }

    const toggle = ( ) => {
        if( window.isVisible( ) ) {
            window.hide( );
            return;
        }
        show( );
    }

    if( app.isPackaged ) {
        autoLaunch = new AutoLaunch( {
            name: 'WinGuake',
            path: app.getPath( 'exe' )
        } );
    }

    let maximized = false;

    app.on( 'second-instance', ( event, argv ) => {
        if( argv.includes( '-t' ) ) {
            toggle( );
            return;
        }

        if( argv.includes( '-s' ) ) {
            show( );
            return;
        }

        if( argv.includes( '-h' ) ) {
            window.hide( );
            return;
        }

        const target = argv.at( -1 );
        send( 'instance', target );
        show( );
    } );

    let resizeEnable = false;
    const resizeLoop = direction => {
        if( !resizeEnable ) return;

        const position = screen.getCursorScreenPoint( );
        const bounding = window.getBounds( );

        switch( direction ) {
            case 'top':
                bounding.height += bounding.y - position.y;
                bounding.y = position.y;
                break;
            case 'bottom':
                bounding.height = position.y - bounding.y;
                break;
            case 'left':
                bounding.width += bounding.x - position.x;
                bounding.x = position.x;
                break;
            case 'right':
                bounding.width = position.x - bounding.x;
                break;
        }

        window.setBounds( bounding );

        const display = screen.getDisplayNearestPoint( bounding );

        multipliers = {
            x: ( bounding.x - display.bounds.x ) / display.bounds.width,
            y: ( bounding.y - display.bounds.y ) / display.bounds.height,
            width: bounding.width / display.bounds.width,
            height: bounding.height / display.bounds.height
        }

        setTimeout( ( ) => resizeLoop( direction ), 10 );
    }

    const keysDown = [ ];

    Array.prototype.compare = function( array ) {
        if( this.length != array.length ) return false;
        for( let i = 0; i < this.length; i++ ) {
            if( this[ i ] != array[ i ] ) return false;
        }
        return true;
    }

    let autoLaunch;

    const binds = {
        kill: {
            combination: [ ],
            up: ( ) => send( 'kill' )
        },
        ghost: {
            combination: [ ],
            down: ( ) => {
                window.setIgnoreMouseEvents( true );
                send( 'ghost', true )
            },
            up: ( ) => {
                window.setIgnoreMouseEvents( false );
                send( 'ghost', false );
                window.focus( );
            }
        },
        toggle: {
            combination: [ ],
            up: toggle
        },
        instance: {
            combination: [ ],
            up: ( ) => send( 'instance' )
        },
        devTools: {
            combination: [ UiohookKey.F6 ],
            up: ( ) => {
                if( !app.isPackaged )
                window.toggleDevTools( )
            }
        },
        reload: {
            combination: [ UiohookKey.F5 ],
            up: ( ) => {
                if( !app.isPackaged )
                window.reload( )
            }
        }
    }

    const { send } = new IPC( ipcMain, window.webContents, {
        bounding: boundings => multipliers = boundings,
        startingDirectory: async ( _, answer ) => {
            const result = await dialog.showOpenDialog( {
                properties: [ 'openDirectory' ]
            } );
            const [ directory ] = result.filePaths;
            answer( false, directory );
        },
        resizeWindow: ( { state, direction } ) => {
            resizeEnable = state;
            if( resizeEnable ) {
                resizeLoop( direction );
                return;
            }
            send( 'bounding', multipliers );
        },
        kill: id => {
            const instance = instances[ id ];
            if( !instance ) return;
            instance.kill( );
        },
        toggleMax: ( ) => {
            maximized = !maximized;
            if( !maximized ) {
                show( );
                return;
            }
            window.maximize( );
        },
        resize: ( { cols, rows } ) => {
            for( const instance of Object.values( instances ) ) {
                instance.resize( cols, rows );
            }
        },
        bell: shell.beep,
        bind: ( { name, combination } ) => {
            if( !binds[ name ] ) return;
            binds[ name ].combination = combination.replaceAll( 'Control', 'Ctrl' ).split( '+' ).map( str => UiohookKey[ str ] );
        },
        autoLaunch: async ( _, answer ) => {
            if( !app.isPackaged ) {
                answer( false );
                return;
            }

            answer( await autoLaunch.isEnabled( ) );
        },
        toggleAutoLaunch: async ( _, answer ) => {
            if( !app.isPackaged ) {
                answer( false );
                return;
            }

            const enabled = await autoLaunch.isEnabled( );
            if( enabled ) {
                await autoLaunch.disable( );
            } else {
                await autoLaunch.enable( );
            }

            answer( !enabled );
        },
        instance: ( { id, shell, cwd, file, write, exit }, answer ) => {
            const ptyProcess = pty.spawn( shell, file ? [ file ] : [ ], {
                name: 'xterm-color',
                cols: 80,
                rows: 30,
                cwd: cwd || process.env.HOME
            } );

            ptyProcess.onData( write );
            ptyProcess.onExit( reason => {
                delete instances[ id ];
                exit( reason );
            } );

            instances[ id ] = ptyProcess;

            answer( true, {
                write: data => ptyProcess.write( data ),
                kill: ( ) => ptyProcess.kill( )
            } );

            show( );
        }
    }, console.error );

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

} )( );