require.config({
    baseUrl: "js"
});

require([
    "util/gl-context-helper",
    "util/camera",
    "util/gl-util",
    "md5",
    "util/gl-matrix-min",
    "js/util/game-shim.js",
    "js/util/Stats.js"
], function(GLContextHelper, Camera, GLUtil, MD5) {
    "use strict";

    // Shader
    var meshVS = [
        "attribute vec3 position;",
        "attribute vec2 texture;",
        "attribute vec3 normal;",
        "attribute vec3 tangent;",

        "uniform vec3 meshPos;",
        "uniform vec3 lightPos;",

        "uniform mat4 modelViewMat;",
        "uniform mat4 projectionMat;",
        "uniform mat3 modelViewInvMat;",

        "varying vec2 vTexCoord;",
        "varying vec3 tangentLightDir;",
        "varying vec3 tangentEyeDir;",

        "void main(void) {",
        " vec4 vPosition = modelViewMat * vec4(position + meshPos, 1.0);",
        " gl_Position = projectionMat * vPosition;",
        " vTexCoord = texture;",

        " vec3 n = normalize(normal * modelViewInvMat);",
        " vec3 t = normalize(tangent * modelViewInvMat);",
        " vec3 b = cross (n, t);",

        " mat3 tbnMat = mat3(t.x, b.x, n.x,",
        "                    t.y, b.y, n.y,",
        "                    t.z, b.z, n.z);",

        " vec3 lightDir = lightPos - vPosition.xyz;",
        " tangentLightDir = lightDir * tbnMat;",

        " vec3 eyeDir = normalize(-vPosition.xyz);",
        " tangentEyeDir = eyeDir * tbnMat;",
        "}"
    ].join("\n");

    // Fragment Shader
    var meshFS = [
        "precision mediump float;",

        "varying vec2 vTexCoord;",
        "varying vec3 tangentLightDir;",
        "varying vec3 tangentEyeDir;",

        "uniform sampler2D diffuse;",
        "uniform sampler2D specular;",
        "uniform sampler2D normalMap;",

        "uniform vec3 ambientLight;",
        "uniform vec3 lightColor;",
        "uniform vec3 specularColor;",
        "uniform float shininess;",

        "void main(void) {",
        " vec3 lightDir = normalize(tangentLightDir);",
        " vec3 normal = normalize(2.0 * (texture2D(normalMap, vTexCoord.st).rgb - 0.5));",
        " vec4 diffuseColor = texture2D(diffuse, vTexCoord.st);",

        " float specularLevel = texture2D(specular, vTexCoord.st).r;",

        " vec3 eyeDir = normalize(tangentEyeDir);",
        " vec3 reflectDir = reflect(-lightDir, normal);",
        " float specularFactor = pow(clamp(dot(reflectDir, eyeDir), 0.0, 1.0), shininess) * specularLevel;",

        " float lightFactor = max(dot(lightDir, normal), 0.0);",
        " vec3 lightValue = ambientLight + (lightColor * lightFactor) + (specularColor * specularFactor);",

        " gl_FragColor = vec4(diffuseColor.rgb * lightValue, diffuseColor.a);",
        "}"
    ].join("\n");

    var ambientLight = vec3.create([0.2, 0.2, 0.2]);
    var lightPos = vec3.create([3, 3, 3]);
    var lightColor = vec3.create([1, 1, 1]);
    var specularColor = vec3.create([1, 1, 1]);
    var shininess = 8;

    var Renderer = function (gl, canvas) {
        this.camera = new Camera.OrbitCamera(canvas);
        this.camera.setCenter([0, 0, 64]);
        this.camera.orbit(-Math.PI * 0.5, 0);
        this.camera.setDistance(390);
        this.camera.minDistance = 32;
        
        this.projectionMat = mat4.create();
        this.modelViewInvMat = mat3.create();
        
        gl.clearColor(0.0, 0.0, 0.1, 1.0);
        gl.clearDepth(1.0);
        gl.enable(gl.DEPTH_TEST);

        gl.enable(gl.BLEND);
        gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
        
        this.animations = [];
        this.meshShader = GLUtil.createProgram(gl, meshVS, meshFS);
        this.models = [];
        this.isLoading = false;
        for (var i = 0; i < 1; ++i) {
            this.addMesh(gl);
        }
    };

    Renderer.prototype.resize = function (gl, canvas) {
        var fov = 45;
        gl.viewport(0, 0, canvas.width, canvas.height);
        mat4.perspective(fov, canvas.width/canvas.height, 1.0, 4096.0, this.projectionMat);
    };

    Renderer.prototype.draw = function (gl, timing) {
        this.camera.update(timing.frameTime);

        var viewMat = this.camera.getViewMat();
        mat4.toInverseMat3(viewMat, this.modelViewInvMat);
        
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        var shader = this.meshShader;
        gl.useProgram(shader.program);

        gl.uniformMatrix4fv(shader.uniform.modelViewMat, false, viewMat);
        gl.uniformMatrix4fv(shader.uniform.projectionMat, false, this.projectionMat);
        gl.uniformMatrix3fv(shader.uniform.modelViewInvMat, false, this.modelViewInvMat);

        // Lighting
        gl.uniform3fv(shader.uniform.ambientLight, ambientLight);
        gl.uniform3fv(shader.uniform.lightPos, lightPos);
        gl.uniform3fv(shader.uniform.lightColor, lightColor);
        gl.uniform3fv(shader.uniform.specularColor, specularColor);
        gl.uniform1f(shader.uniform.shininess, shininess);

        for (var i = 0; i < this.models.length; ++i) {
            this.models[i].draw(gl, shader);
        }
    };

    Renderer.prototype.addMesh = function(gl) {
        var self = this;
        var model = new MD5.Md5Mesh();
        model.load(gl, 'models/md5/monsters/hellknight/hellknight.md5mesh', function(mesh) {
            var x = 200 - Math.random() * 400;
            var y = 200 - Math.random() * 400;
            mesh.pos = vec3.create([x, y, 0.0]);
            self.models.push(mesh);
            meshNumber.innerHTML = 'Meshes: ' + self.models.length;

            var anim = new MD5.Md5Anim();
            anim.load('models/md5/monsters/hellknight/idle2.md5anim', function(anim) {
                var currentFrame = Math.round(Math.random() * 120);
                var interval = 1000 / anim.frameRate;

                var handle = setInterval(function() {
                    currentFrame++;
                    model.setAnimationFrame(gl, anim, currentFrame);
                }, interval);

                self.animations.push({anim: anim, handle: handle});
            });
        });
    };

    Renderer.prototype.removeMesh = function() {
        if (this.models.length == 0) {
            console.log('no more models');
            return;
        }
        var anim = this.animations.pop();
        clearInterval(anim.handle);
        this.models.pop();
        meshNumber.innerHTML = 'Meshes: ' + this.models.length;
    }

    // Setup the canvas and GL context, initialize the scene 
    var canvas = document.getElementById("webgl-canvas");
    var contextHelper = new GLContextHelper(canvas, document.getElementById("content-frame"));
    var renderer = new Renderer(contextHelper.gl, canvas);

    var stats = new Stats();
    document.getElementById("controls-container").appendChild(stats.domElement);

    var addBtn = document.getElementById("addBtn");
    addBtn.addEventListener("click", function() {
        renderer.addMesh(contextHelper.gl);
    });

    var removeBtn = document.getElementById("removeBtn");
    removeBtn.addEventListener("click", function() {
        renderer.removeMesh();
    });

    var meshNumber = document.getElementById("meshNumber");

    var simdCheckbox = document.getElementById("simdCheckbox");
    if (typeof SIMD === "undefined") {
        simdCheckbox.disabled = true;
        var simdLabel = document.getElementById("simdLabel");
        simdLabel.innerHTML = "Your browser doesn't support SIMD";
    }
    simdCheckbox.checked = false;

    simdCheckbox.onchange = function(event) {
        if (simdCheckbox.checked)
            MD5.setSIMD(true);
        else
            MD5.setSIMD(false);
    };
    
    // Get the render loop going
    contextHelper.start(renderer, stats);
});