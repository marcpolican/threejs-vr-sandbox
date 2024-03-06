import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { VRButton } from 'three/addons/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/addons/webxr/XRControllerModelFactory.js';
import { XRHandModelFactory } from 'three/addons/webxr/XRHandModelFactory.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

let container;
let camera, scene, renderer;
let hand1, hand2;
let controller1, controller2;
let controllerGrip1, controllerGrip2;
let controls;
let spheresParent;
let spheres = [];
let matActive;
let matInactive;
let raycaster;
let intersected = [];

// Physics variables
const gravityConstant = 9.8;
let collisionConfiguration;
let dispatcher;
let broadphase;
let solver;
let physicsWorld;

let tmpTrans;
let colMargin = 0.05;

// Rigid bodies include all movable objects
const rigidBodies = [];

const colorSelected = new THREE.Color(0xffff00);
const colorNormal = new THREE.Color(0x0000ff);

const clock = new THREE.Clock();

Ammo().then( function ( AmmoLib ) {
    Ammo = AmmoLib;
    init();
    animate();
} );


function init() {
    initGraphics();
    initPhysics();
    initWorld();
}

function initPhysics() {
    collisionConfiguration = new Ammo.btDefaultCollisionConfiguration();
    dispatcher = new Ammo.btCollisionDispatcher( collisionConfiguration );
    broadphase = new Ammo.btDbvtBroadphase();
    solver = new Ammo.btSequentialImpulseConstraintSolver();
    physicsWorld = new Ammo.btDiscreteDynamicsWorld( dispatcher, broadphase, solver, collisionConfiguration );
    physicsWorld.setGravity( new Ammo.btVector3( 0, - gravityConstant, 0 ) );
    tmpTrans = new Ammo.btTransform();
}

function initGraphics() {

    container = document.createElement( 'div' );
    document.body.appendChild( container );

    scene = new THREE.Scene();
    scene.background = new THREE.Color( 0x444444 );

    camera = new THREE.PerspectiveCamera( 50, window.innerWidth / window.innerHeight, 0.1, 20 );
    camera.position.set( 0, 0, 7 );

    controls = new OrbitControls( camera, container );
    controls.target.set( 0, 0, 0 );
    controls.update();


    scene.add( new THREE.HemisphereLight( 0xbcbcbc, 0xa5a5a5, 3 ) );

    const light = new THREE.DirectionalLight( 0xffffff, 3 );
    light.position.set( 0, 6, 0 );
    light.castShadow = true;
    light.shadow.camera.top = 20;
    light.shadow.camera.bottom = -20;
    light.shadow.camera.right = 20;
    light.shadow.camera.left = - 20;
    light.shadow.mapSize.set( 4096, 4096 );
    scene.add( light );

    //

    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setPixelRatio( window.devicePixelRatio );
    renderer.setSize( window.innerWidth, window.innerHeight );
    renderer.shadowMap.enabled = true;
    renderer.xr.enabled = true;

    container.appendChild( renderer.domElement );

    const sessionInit = {
        requiredFeatures: [ 'hand-tracking' ]
    };

    document.body.appendChild( VRButton.createButton( renderer, sessionInit ) );

    // controllers

    controller1 = renderer.xr.getController( 0 );
    controller1.addEventListener("selectstart", onSelectStart);
    controller1.addEventListener("selectend", onSelectEnd);
    scene.add( controller1 );

    controller2 = renderer.xr.getController( 1 );
    controller2.addEventListener("selectstart", onSelectStart);
    controller2.addEventListener("selectend", onSelectEnd);
    scene.add( controller2 );

    const controllerModelFactory = new XRControllerModelFactory();
    const handModelFactory = new XRHandModelFactory();

    // Hand 1
    controllerGrip1 = renderer.xr.getControllerGrip( 0 );
    controllerGrip1.add( controllerModelFactory.createControllerModel( controllerGrip1 ) );
    scene.add( controllerGrip1 );

    hand1 = renderer.xr.getHand( 0 );
    hand1.add( handModelFactory.createHandModel( hand1 ) );

    scene.add( hand1 );

    // Hand 2
    controllerGrip2 = renderer.xr.getControllerGrip( 1 );
    controllerGrip2.add( controllerModelFactory.createControllerModel( controllerGrip2 ) );
    scene.add( controllerGrip2 );

    hand2 = renderer.xr.getHand( 1 );
    hand2.add( handModelFactory.createHandModel( hand2 ) );
    scene.add( hand2 );

    //
    const geometry = new THREE.BufferGeometry().setFromPoints([ 
        new THREE.Vector3( 0, 0, 0 ), 
        new THREE.Vector3( 0, 0, -1) 
    ]);

    const line = new THREE.Line( geometry );
    line.name = 'line';
    line.scale.z = 5;

    controller1.add( line.clone() );
    controller2.add( line.clone() );

    raycaster = new THREE.Raycaster();
    raycaster.near = 0.1;
    raycaster.far = 20;

    //
    
    spheresParent = new THREE.Group();
    scene.add(spheresParent);

//    for (let i=0; i<10; i++) {
//        const geometry = new THREE.SphereGeometry(0.2, 32, 16);
//        const material = new THREE.MeshBasicMaterial( { color: colorNormal } ); 
//        spheres[i] = new THREE.Mesh( geometry, material ); 
//        spheres[i].position.set(
//            getRandomRange(-2, 2), 
//            getRandomRange(0, 2), 
//            getRandomRange(-2, 2));
//        spheresParent.add(spheres[i]);
//    }

    window.addEventListener( 'resize', onWindowResize );
    window.addEventListener( 'mousedown', onMouseDown, false );  
    window.addEventListener( 'mouseup', onMouseUp, false );  

}

function initWorld() {
    // ground
    createWall(
        new THREE.Vector3(4, 0.1, 8),
        new THREE.Vector3(0, 0, -2),
        new THREE.Color(0x777777)
    );

    // left
    createWall(
        new THREE.Vector3(0.1, 4, 8),
        new THREE.Vector3(-2, 2, -2),
        new THREE.Color(0x772222)
    );

    // right
    createWall(
        new THREE.Vector3(0.1, 4, 8),
        new THREE.Vector3(2, 2, -2),
        new THREE.Color(0x772222)
    );

    // forward
    createWall(
        new THREE.Vector3(4, 4, 1),
        new THREE.Vector3(0, 2, -6.5),
        new THREE.Color(0x227722)
    );


    const loader = new GLTFLoader();
    loader.load( 'target.glb', function ( gltf ) {
        gltf.scene.traverse( function( node ) {
            if ( node.isMesh ) { 
                if (node.name == "Cylinder") {
                    node.castShadow = true; 
                    node.receiveShadow = true; 
                }
                node.position.set(0,2,-5);
            }
        });


        scene.add( gltf.scene );

    }, undefined, function ( error ) {
        console.error( error );
    } );

}

function createWall(size, pos, color) {
    const floorGeometry = new THREE.BoxGeometry(size.x, size.y, size.z);
    const floorMaterial = new THREE.MeshStandardMaterial( { color: color } );
    const floor = new THREE.Mesh(floorGeometry, floorMaterial);
    floor.receiveShadow = true;
    floor.position.set(pos.x, pos.y, pos.z);
    scene.add(floor);

    let transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin( new Ammo.btVector3(floor.position.x,floor.position.y,floor.position.z) );
    transform.setRotation( new Ammo.btQuaternion(0,0,0,1) );
    let motionState = new Ammo.btDefaultMotionState(transform);

    let colShape = new Ammo.btBoxShape(new Ammo.btVector3(size.x * 0.5, size.y * 0.5, size.z * 0.5));
    colShape.setMargin(colMargin);

    let localInertia = new Ammo.btVector3( 0, 0, 0 );
    colShape.calculateLocalInertia(0, localInertia );

    let rbInfo = new Ammo.btRigidBodyConstructionInfo( 0, motionState, colShape, localInertia );
    let body = new Ammo.btRigidBody( rbInfo );
    physicsWorld.addRigidBody( body );
}

function getRandomRange(min, max) {
    let range = max - min;
    return Math.random() * range + min;
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();

    renderer.setSize( window.innerWidth, window.innerHeight );

}	

function getIntersections( controller ) {
    controller.updateMatrixWorld();
    raycaster.setFromXRController( controller );
    return raycaster.intersectObjects( spheresParent.children, false );

}

function intersectObjects( controller ) {

    // Do not highlight in mobile-ar
    if ( controller.userData.targetRayMode === 'screen' ) return;

    // Do not highlight when already selected
    if ( controller.userData.selected !== undefined ) return;

    const line = controller.getObjectByName( 'line' );
    const intersections = getIntersections( controller );

    if ( intersections.length > 0 ) {
        const intersection = intersections[ 0 ];
        const object = intersection.object;
        object.material.emissive.r = 1;
        intersected.push( object );
        line.scale.z = intersection.distance;
    } else {
        line.scale.z = 5;
    }
}

function cleanIntersected() {
    while ( intersected.length ) {
        const object = intersected.pop();
        object.material.color.set(colorNormal);
    }
}

function onSelectStart( event ) {
    const controller = event.target;
    controller.updateMatrixWorld();
    raycaster.setFromXRController( controller );
    createBall(controller.position, raycaster.ray.direction);

//    const controller = event.target;
//    const intersections = getIntersections( controller );
//
//    if ( intersections.length > 0 ) {
//        const intersection = intersections[ 0 ];
//        const object = intersection.object;
//        object.material.color.set(colorSelected);
//        //controller.attach( object );
//        controller.userData.selected = object;
//    }
//    controller.userData.targetRayMode = event.data.targetRayMode;
}

function onSelectEnd( event ) {
//    const controller = event.target;
//    if ( controller.userData.selected !== undefined ) {
//        const object = controller.userData.selected;
//        object.material.color.set(colorNormal);
//        //group.attach( object );
//        controller.userData.selected = undefined;
//    }
}

function onMouseDown( event ) {

    let pointer = new THREE.Vector2();
    pointer.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    pointer.y = - ( event.clientY / window.innerHeight ) * 2 + 1;

    raycaster.setFromCamera( pointer, camera );
    createBall(raycaster.ray.origin, raycaster.ray.direction);

//    let intersections = raycaster.intersectObjects( spheresParent.children, true );
//
//	//const intersects = raycaster.intersectObjects( scene.children );
//	//for ( let i = 0; i < intersects.length; i ++ ) {
//	//	intersects[ i ].object.material.color.set( 0xff0000 );
//	//}
//
//    if ( intersections.length > 0 ) {
//        const intersection = intersections[ 0 ];
//        const object = intersection.object;
//        object.material.color.set(colorSelected);
//        intersected.push( object );
//    }
}

function onMouseUp( event ) {
    //cleanIntersected();
}

function animate() {
    renderer.setAnimationLoop( render );
}

function render() {
    const deltaTime = clock.getDelta();
    updatePhysics( deltaTime );
    renderer.render( scene, camera );

}

function updatePhysics( deltaTime ) {
    physicsWorld.stepSimulation( deltaTime, 10 );

    // Update rigid bodies
    for ( let i = 0; i < rigidBodies.length; i++ ) {
        let objThree = rigidBodies[ i ];
        let objAmmo = objThree.userData.physicsBody;
        let ms = objAmmo.getMotionState();
        if ( ms ) {

            ms.getWorldTransform( tmpTrans );
            let p = tmpTrans.getOrigin();
            let q = tmpTrans.getRotation();
            objThree.position.set( p.x(), p.y(), p.z() );
            objThree.quaternion.set( q.x(), q.y(), q.z(), q.w() );
        }
    }
}

function createBall(origin, direction){
    let pos = origin;
    let radius = 0.1;
    let quat = {x: 0, y: 0, z: 0, w: 1};
    let mass = 1;
    let speed = 20;
    let velocity = new Ammo.btVector3(direction.x * speed, direction.y * speed, direction.z * speed);

    //threeJS Section
    
    const geometry = new THREE.SphereGeometry(radius, 16, 8);
    const material = new THREE.MeshBasicMaterial( { color: 0x888800 } ); 
    let ball = new THREE.Mesh( geometry, material ); 

    ball.position.set(pos.x, pos.y, pos.z);
    ball.castShadow = true;
    ball.receiveShadow = true;
    scene.add(ball);


    //Ammojs Section
    let transform = new Ammo.btTransform();
    transform.setIdentity();
    transform.setOrigin( new Ammo.btVector3( pos.x, pos.y, pos.z ) );
    transform.setRotation( new Ammo.btQuaternion( quat.x, quat.y, quat.z, quat.w ) );
    let motionState = new Ammo.btDefaultMotionState( transform );

    let colShape = new Ammo.btSphereShape( radius );
    colShape.setMargin(colMargin);

    let localInertia = new Ammo.btVector3(0,0,0)
    colShape.calculateLocalInertia( mass, localInertia);

    let rbInfo = new Ammo.btRigidBodyConstructionInfo( mass, motionState, colShape, localInertia );
    let body = new Ammo.btRigidBody( rbInfo );
    body.setLinearVelocity(velocity);

    physicsWorld.addRigidBody( body );
    ball.userData.physicsBody = body;
    rigidBodies.push(ball);
}
