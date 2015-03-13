'use strict';

var CallbackStore = require('famous-utilities').CallbackStore;
var Vec2 = require('famous-math').Vec2;

var VEC_REGISTER = new Vec2();

var gestures = {drag: true, tap: true, rotate: true, pinch: true};
var progressbacks = [processPointerStart, processPointerMove, processPointerEnd];

var touchEvents = ['touchstart', 'touchmove', 'touchend'];
var mouseEvents = ['mousedown', 'mousemove', 'mouseup'];
var methods = ['preventDefault'];
var touchProperties = [{targetTouches: {0: ['pageX', 'pageY', 'identifier'], 1: ['pageX', 'pageY', 'identifier']}}];
var mouseProperties = ['pageX', 'pageY'];

function GestureHandler (dispatch, events) {
    this.dispatch = dispatch;

    this.last1 = new Vec2();
    this.last2 = new Vec2();

    this.delta1 = new Vec2();
    this.delta2 = new Vec2();

    this.velocity1 = new Vec2();
    this.velocity2 = new Vec2();

    this.dist = 0;
    this.diff12 = new Vec2();

    this.center = new Vec2();
    this.centerDelta = new Vec2();
    this.centerVelocity = new Vec2();

    this.pointer1 = {
            position: this.last1,
            delta: this.delta1,
            velocity: this.velocity1,
    };

    this.pointer2 = {
            position: this.last2,
            delta: this.delta2,
            velocity: this.velocity2,
    };

    this.event = {
        status: null,
        time: 0,
        pointers: [],
        center: this.center,
        centerDelta: this.centerDelta,
        centerVelocity: this.centerVelocity,
        points: 0,
        current: 0
    };

    this.trackedPointerIDs = [-1, -1];
    this.timeOfPointer = 0;
    this.multiTap = 0;

    this.mice = [];

    this.gestures = [];
    this.options = {};
    this.trackedGestures = {};

    this._events = new CallbackStore();
    for (var i = 0, len = events.length; i < len; i++) {
        var gesture = events[i].event;
        var callback = events[i].callback;
        if (gestures[gesture]) {
            this.trackedGestures[gesture] = true;
            this.gestures.push(gesture);
            if (events[i].event) this.options[gesture] = events[i];
            this._events.on(gesture, callback);
        }
    }

    var renderables = dispatch.getRenderables();
    for (var i = 0, len = renderables.length; i < len; i++) {
        for (var j = 0; j < 3; j++) {
            var touchEvent = touchEvents[j];
            var mouseEvent = mouseEvents[j];
            if (renderables[i].on) renderables[i].on(touchEvent, methods, touchProperties);
            dispatch.registerTargetedEvent(touchEvent, progressbacks[j].bind(this));
            if (renderables[i].on) renderables[i].on(mouseEvent, methods, mouseProperties);
            dispatch.registerTargetedEvent(mouseEvent, progressbacks[j].bind(this));
        }
        if (renderables[i].on) renderables[i].on('mouseleave', methods, mouseProperties);
        dispatch.registerTargetedEvent('mouseleave', processMouseLeave.bind(this));
    }
}

GestureHandler.toString = function toString() {
    return 'GestureHandler';
};

GestureHandler.prototype.triggerGestures = function() {
    var payload = this.event;
    for (var i = 0, len = this.gestures.length; i < len; i++) {
        var gesture = this.gestures[i];
        switch (gesture) {
            case 'rotate':
            case 'pinch':
                if (payload.points === 2) this.trigger(gesture, payload);
                break;
            case 'tap':
                if (payload.status !== 'move') {
                    if (this.options['tap']) {
                        var pts = this.options['tap'].points || 1;
                        if(this.multiTap >= pts && payload.points >= pts) this.trigger(gesture, payload);
                    }
                    else this.trigger(gesture, payload);
                }
                break;
            default:
                this.trigger(gesture, payload);
                break;
        }
    }
};

GestureHandler.prototype.trigger = function trigger (ev, payload) {
    this._events.trigger(ev, payload);
};

function processPointerStart(e) {
    var t;
    if (!e.targetTouches) {
        this.mice[0] = e;
        t = this.mice;
        e.identifier = 1;
    }
    else t = e.targetTouches;

    if (t[0] && t[1] && this.trackedPointerIDs[0] === t[0].identifier && this.trackedPointerIDs[1] === t[1].identifier) {
        return;
    }

    this.event.time = Date.now();

    if (this.trackedPointerIDs[0] !== t[0].identifier) {
        if (this.trackedGestures['tap']) {
            var threshold = (this.options['tap'] && this.options['tap'].threshold) || 250;
            if (this.event.time - this.timeOfPointer < threshold) this.event.taps++;
            else this.event.taps = 1;
            this.timeOfPointer = this.event.time;
            this.multiTap = 1;
        }
        this.event.current = 1;
        this.event.points = 1;
        var id = t[0].identifier;
        this.trackedPointerIDs[0] = id;

        this.last1.set(t[0].pageX, t[0].pageY);
        this.velocity1.clear();
        this.delta1.clear();
        this.event.pointers.push(this.pointer1);
    }
    if (t[1] && this.trackedPointerIDs[1] !== t[1].identifier) {
        if (this.trackedGestures['tap']) {
            var threshold = (this.options['tap'] && this.options['tap'].threshold) || 250;
            if (this.event.time - this.timeOfPointer < threshold) this.multiTap = 2;
        }
        this.event.current = 2;
        this.event.points = 2;
        var id = t[1].identifier;
        this.trackedPointerIDs[1] = id;

        this.last2.set(t[1].pageX, t[1].pageY);
        this.velocity2.clear();
        this.delta2.clear();

        Vec2.add(this.last1, this.last2, this.center).scale(0.5);
        this.centerDelta.clear();
        this.centerVelocity.clear();

        Vec2.subtract(this.last2, this.last1, this.diff12);
        this.dist = this.diff12.length();

        if (this.trackedGestures['pinch']) {
            this.event.scale = this.event.scale || 1;
            this.event.scaleDelta = 0;
            this.event.scaleVelocity = 0;
        }
        if (this.trackedGestures['rotate']) {
            this.event.rotation = this.event.rotation || 0;
            this.event.rotationDelta = 0;
            this.event.rotationVelocity = 0;
        }
        this.event.pointers.push(this.pointer2);
    }

    this.event.status = 'start';
    if (this.event.points === 1) {
        this.center.copy(this.last1);
        this.centerDelta.clear();
        this.centerVelocity.clear();
        if (this.trackedGestures['pinch']) {
            this.event.scale = 1;
            this.event.scaleDelta = 0;
            this.event.scaleVelocity = 0;
        }
        if (this.trackedGestures['rotate']) {
            this.event.rotation = 0;
            this.event.rotationDelta = 0;
            this.event.rotationVelocity = 0;
        }
    }
    this.triggerGestures();
}

function processPointerMove(e) {
    var t;
    if (!e.targetTouches) {
        if (!this.event.current) return;
        this.mice[0] = e;
        t = this.mice;
        e.identifier = 1;
    }
    else t = e.targetTouches;

    var time = Date.now();
    var dt = time - this.event.time;
    if (dt === 0) return;
    var invDt = 1000 / dt;
    this.event.time = time;

    this.event.current = 1;
    this.event.points = 1;
    if (this.trackedPointerIDs[0] === t[0].identifier) {
        VEC_REGISTER.set(t[0].pageX, t[0].pageY);
        Vec2.subtract(VEC_REGISTER, this.last1, this.delta1);
        Vec2.scale(this.delta1, invDt, this.velocity1);
        this.last1.copy(VEC_REGISTER);

    }
    if (t[1]) {
        this.event.current = 2;
        this.event.points = 2;
        VEC_REGISTER.set(t[1].pageX, t[1].pageY);
        Vec2.subtract(VEC_REGISTER, this.last2, this.delta2);
        Vec2.scale(this.delta2, invDt, this.velocity2);
        this.last2.copy(VEC_REGISTER);

        Vec2.add(this.last1, this.last2, VEC_REGISTER).scale(0.5);
        Vec2.subtract(VEC_REGISTER, this.center, this.centerDelta);
        Vec2.add(this.velocity1, this.velocity2, this.centerVelocity).scale(0.5);
        this.center.copy(VEC_REGISTER);

        Vec2.subtract(this.last2, this.last1, VEC_REGISTER);

        if (this.trackedGestures['rotate']) {
            var dot = VEC_REGISTER.dot(this.diff12);
            var cross = VEC_REGISTER.cross(this.diff12);
            var theta = -Math.atan2(cross, dot);
            this.event.rotation += theta;
            this.event.rotationDelta = theta;
            this.event.rotationVelocity = theta * invDt;
        }

        var dist = VEC_REGISTER.length();
        var scale = dist / this.dist;
        this.diff12.copy(VEC_REGISTER);
        this.dist = dist;

        if (this.trackedGestures['pinch']) {
            this.event.scale *= scale;
            scale -= 1.0;
            this.event.scaleDelta = scale;
            this.event.scaleVelocity = scale * invDt;
        }
    }

    this.event.status = 'move';
    if (this.event.points === 1) {
        this.center.copy(this.last1);
        this.centerDelta.copy(this.delta1);
        this.centerVelocity.copy(this.velocity1);
        if (this.trackedGestures['pinch']) {
            this.event.scale = 1;
            this.event.scaleDelta = 0;
            this.event.scaleVelocity = 0;
        }
        if (this.trackedGestures['rotate']) {
            this.event.rotation = 0;
            this.event.rotationDelta = 0;
            this.event.rotationVelocity = 0;
        }
    }
    this.triggerGestures();
}

function processPointerEnd(e) {
    var t;
    if (!e.targetTouches) {
        if (!this.event.current) return;
        this.mice.pop();
        t = this.mice;
    }
    else t = e.targetTouches;

    if (t[0] && t[1] && this.trackedPointerIDs[0] === t[0].identifier && this.trackedPointerIDs[1] === t[1].identifier) {
            return;
    }

    this.event.status = 'end';
    if (!t[0]) {
        this.event.current = 0;
        this.trackedPointerIDs[0] = -1;
        this.trackedPointerIDs[1] = -1;
        this.triggerGestures();
        this.event.pointers.pop();
        this.event.pointers.pop();
        return;
    }
    else if(this.trackedPointerIDs[0] !== t[0].identifier) {
        this.trackedPointerIDs[0] = -1;
        var id = t[0].identifier;
        this.trackedPointerIDs[0] = id;

        this.last1.set(t[0].pageX, t[0].pageY);
        this.velocity1.clear();
        this.delta1.clear();
    }
    if (!t[1]) {
        this.event.current = 1;
        this.trackedPointerIDs[1] = -1;
        this.triggerGestures();
        this.event.points = 1;
        this.event.pointers.pop();
    }
    else if (this.trackedPointerIDs[1] !== t[1].identifier) {
        this.trackedPointerIDs[1] = -1;
        this.event.points = 2;
        var id = t[1].identifier;
        this.trackedPointerIDs[1] = id;

        this.last2.set(t[1].pageX, t[1].pageY);
        this.velocity2.clear();
        this.delta2.clear();

        Vec2.add(this.last1, this.last2, this.center).scale(0.5);
        this.centerDelta.clear();
        this.centerVelocity.clear();

        Vec2.subtract(this.last2, this.last1, this.diff12);
        this.dist = this.diff12.length();
    }
}

function processMouseLeave(e) {
    if (this.event.current) {
        this.event.status = 'end';
        this.event.current = 0;
        this.trackedPointerIDs[0] = -1;
        this.triggerGestures();
        this.event.pointers.pop();
    }
}

module.exports = GestureHandler;
