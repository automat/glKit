var GLKit = require('../../src/glKit/foam.js');

function App()
{
    GLKit.Application.apply(this,arguments);

    this.setFullWindowFrame(true);

    this.setTargetFPS(60);
    this.setSize(2048,768);
}

App.prototype = Object.create(GLKit.Application.prototype);

App.prototype.setup = function()
{
    var kgl = this.kgl;

    var light0 = this._light0 = new GLKit.Light(kgl.LIGHT_0);
        light0.setAmbient3f(0,0,0);
        light0.setDiffuse3f(0.8,0.8,0.8);
        light0.setSpecular3f(1,1,1);
        light0.setPosition3f(1,1,1);

    var light1 = this._light1 = new GLKit.Light(kgl.LIGHT_1);
        light1.setAmbient3f(0,0,0);
        light1.setDiffuse3f(0.8,0.8,0.8);
        light1.setSpecular3f(1,1,1);
        light1.setPosition3f(1,1,1);

    var light2 = this._light2 = new GLKit.Light(kgl.LIGHT_2);
        light2.setAmbient3f(0,0,0);
        light2.setDiffuse3f(0.8,0.8,0.8);
        light2.setSpecular3f(1,1,1);
        light2.setPosition3f(1,1,1);

    var material = this._material0 = new GLKit.Material();
        material.setDiffuse3f(0.7,0.7,0.7);
        material.setAmbient3f(0.7,0.7,0.7);
        material.setSpecular3f(1,1,1);
        material.shininess = 20.0;


};

App.prototype.update = function()
{
    var kgl = this.kgl;
    var cam = this.camera;

    var time = this.getSecondsElapsed(),
        zoom = 3 + Math.sin(time) * 0.25;

    kgl.clear3f(0.1,0.1,0.1);
    kgl.loadIdentity();

    var light0 = this._light0,
        light1 = this._light1,
        light2 = this._light2;


    cam.setPosition3f(light1.position[0] * zoom,light1.position[1] * zoom,light1.position[2] * zoom);

    cam.updateMatrices();

    kgl.drawMode(kgl.LINE_LOOP);
   // this.drawSystem();

    var glMath = GLKit.Math;

    var material = this._material0;







    light0.setPosition3f(6*Math.cos(time), 0, 6*Math.sin(time));
    light1.setPosition3f(2*Math.cos(time*Math.PI), Math.sin(time), 2*Math.sin(time+Math.PI));
    light2.setPosition3f(4*Math.cos(time*Math.PI*0.25), Math.cos(time), 4*Math.sin(time+Math.PI*0.25));

    cam.setTarget3f(0,0,0);
    cam.updateMatrices();

    kgl.drawMode(kgl.LINE_LOOP);

    //this.drawSystem();

    /*---------------------------------------------------------------------------------------------------------*/


    var material = this._material0;

    kgl.useLighting(true);
    kgl.light(light0);
    kgl.light(light1);
    kgl.light(light2);

    kgl.useMaterial(true);

    material.setDiffuse3f(0.6,0.6,0.6);
    material.setAmbient3f(0.6,0.6,0.6);
    material.setSpecular3f(1,1,1);
    material.shininess = 200.0;

    kgl.material(material);

    kgl.drawMode(kgl.TRIANGLES);
    kgl.sphereDetail(20);




    //kgl.cube();


    kgl.material(material);
    kgl.color3f(1,1,1);
    kgl.drawMode(kgl.TRIANGLES);
    kgl.cube(70);

    kgl.sphereDetail(15);

    var iN,jN,kN,
        iP,jP,kP;


    var len      = 10,
        minScale = 2,
        scaleijk,
        scaleijkpos,
        scaleijkobj;

    var pi_3 = Math.PI / 3;

   // kgl.beginDrawElementArrayBatch();
    kgl.drawMode(kgl.TRIANGLES);
    var i = -1, j,k;
    while(++i < len)
    {
        j = -1;
        while(++j < len)
        {
            k = -1;
            while(++k < len)
            {
                iN = i / len;
                jN = j / len;
                kN = k / len;

                iP = (-0.5 + iN) * 3;
                kP = (-0.5 + kN) * 3;
                jP = (-0.5 + jN) * 3;

                scaleijk    = minScale + Math.sin((iN * pi_3 + kN * pi_3 + jN * pi_3)*2 + time * 5);
                scaleijkpos = scaleijk * (1 + Math.abs(Math.sin(time)));
                scaleijkobj = scaleijk * 0.075;

                material.setAmbient3f(iN,kN,jN);
                material.setDiffuse3f(iN,kN,jN);
                //material.shininess = 20 + iN * kN * jN * 1000;

                kgl.material(material);
                kgl.pushMatrix();
                kgl.translate3f(iP * scaleijkpos, kP * scaleijkpos, jP * scaleijkpos);
                //kgl.scale3f(scaleijkobj,scaleijkobj,scaleijkobj);
                //kgl.drawMode(kgl.TRIANGLES);
                //kgl.color4f(iN,kN,jN,1);
                //kgl.rotate3f(Math.sin(time+Math.PI*4*iN),Math.sin(time+Math.PI*4*jN),Math.sin(time+Math.PI*4*kN))
                kgl.sphere(scaleijkobj);
               // kgl.cube(0.5);//scaleijkobj);
                kgl.popMatrix();
            }
        }
    }

   // kgl.endDrawElementArrayBatch();
   // kgl.drawElementArrayBatch();

    kgl.useLighting(false);


};

App.prototype.drawSystem =  function()
{
    var kgl = this.kgl;

    kgl.color1f(0.10);
    GLKit.fGLUtil.drawGridCube(kgl,70,1);

    kgl.color1f(0.075);
    kgl.pushMatrix();
    {
        kgl.translate3f(0,-0.01,0);
        GLKit.fGLUtil.drawGrid(kgl,70,1);
    }
    kgl.popMatrix();


    //Foam.fGLUtil.drawAxes(kgl,20);

    kgl.color1f(1);

    kgl.pushMatrix();
    {
        kgl.translate(this._light0.position);
        GLKit.fGLUtil.octahedron(kgl,0.075);
    }
    kgl.popMatrix();

    kgl.pushMatrix();
    {
        kgl.translate(this._light1.position);
        GLKit.fGLUtil.octahedron(kgl,0.075);
    }
    kgl.popMatrix();

    kgl.pushMatrix();
    {
        kgl.translate(this._light2.position);
        GLKit.fGLUtil.octahedron(kgl,0.075);
    }
    kgl.popMatrix();
};

var app = new App();