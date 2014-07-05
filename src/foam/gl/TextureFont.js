var opentype = require('../../lib/opentype.js'),
    _gl      = require('./gl'),
    glTrans  = require('./glTrans'),
    Program  = require('./Program'),
    Rect     = require('../geom/Rect'),
    Vec2     = require('../math/Vec2'),
    Vec3     = require('../math/Vec3'),
    Color    = require('../util/Color');


var GLYPH_TABLE_TEX_MAX_WIDTH = 2048;

var GLYPH_PADDING      = 10,
    GLYPH_PADDING_2    = GLYPH_PADDING * 2,
    GLYPH_ERROR_MARGIN = 1,
    GLYPH_PADDING_2_MARGIN = GLYPH_PADDING_2 - GLYPH_ERROR_MARGIN;

var GLYPH_NUM_VERTICES = 6;

function removeDuplicates(str){
    return str.replace(/(.)(?=\1)/g, "");
}

function GlyphTextureInfo(){
    this.offset = new Vec2();
    this.size = new Vec2();
    this.baseOffset = 0;

    this.texcoordsMin = new Vec2();
    this.texcoordsMax = new Vec2();
}

function Metrics(){
    this.bounds = new Rect();
    this.ascent = this.descent = 0;
}

function GlyphMetrics(){
    Metrics.call(this);
    this.uniformBounds = new Rect();
    this.advanceWidth = 0;
    this.leftSideBearing = 0;
}

function FontMetrics(){
    Metrics.call(this);
    this.advanceWidthMax = 0;
    this.minLeftSideBearing = this.minRightSideBearing = 0;
}

// TextureFont

function TextureFont(arraybuffer){
    this._glyphs = {};
    this._glyphMetrics = {};
    this._glyphTextureInfos = {};
    this._charsSupported = null;

    this._fontSize    = this._scale = 0;
    this._font        = opentype.parse(arraybuffer);
    this._fontMetrics = new FontMetrics();

    var gl = this._gl = _gl.get();
    var texture       = this._texture = gl.createTexture(),
        texturePrev   = gl.getParameter(gl.TEXTURE_BINDING_2D);
    this._textureSize = new Vec2();

    gl.bindTexture(gl.TEXTURE_2D,texture);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameterf(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindTexture(gl.TEXTURE_2D,texturePrev);

    this._bufferVertex   = gl.createBuffer();
    this._bufferNormal   = gl.createBuffer();
    this._bufferTexcoord = gl.createBuffer();
    this._bufferColor    = gl.createBuffer();
    this._bufferVertexData   = null;
    this._bufferNormalData   = null;
    this._bufferTexcoordData = null;
    this._bufferColorData    = null;

    this._v0 = new Vec3();
    this._v1 = new Vec3();
    this._v2 = new Vec3();
    this._v3 = new Vec3();

    this._uv0 = new Vec2();
    this._uv1 = new Vec2();
    this._uv2 = new Vec2();
    this._uv3 = new Vec2();

    this._prevSize = new Vec2();

    this._setFontSize_Internal(24);
    this.setCharsSupported(TextureFont.getSupportedCharsDefault());

    this._stringLast = '';
    this._stringLastMax = '';
    this._colorLast = null;

    // gl state cache, Foam.Program independent

    this._programRefLast = null;
    this._attribLocationVertexPos = null;
    this._attribLocationVertexNormal = null;
    this._attribLocationVertexColor = null;
    this._attribLocationTexcoord = null;
    this._uniformLocationModelViewMatrix = null;
    this._uniformLocationProjectionMatrix = null;
    this._uniformLocationTexture = null;
}

TextureFont.prototype.setCharsSupported = function(chars){
    this._charsSupported = removeDuplicates(chars);
    this._genMapGlyph();
};

TextureFont.prototype.getCharsSupported = function(){
    return this._charsSupported;
};

TextureFont.getSupportedCharsDefault = function(){
    return "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789.?!,;:'\"()&*=+-/\\@#_[]<>% ";
};

TextureFont.prototype._setFontSize_Internal = function(fontSize){
    var font  = this._font;
    var scale = this._scale = 1.0 / font.unitsPerEm * fontSize;

    var hheaTable   = font.tables.hhea;
    var fontMetrics = this._fontMetrics;

    fontMetrics.advanceWidthMax     = hheaTable.advanceWidthMax * scale;
    fontMetrics.ascent              = hheaTable.ascender * scale;
    fontMetrics.descent             = hheaTable.descender * scale;
    fontMetrics.minLeftSideBearing  = hheaTable.minLeftSideBearing * scale;
    fontMetrics.minRightSideBearing = hheaTable.minRightSideBearing * scale;

    this._fontSize = fontSize;
};

TextureFont.prototype.setFontSize = function(fontSize){
    this._setFontSize_Internal(fontSize);
    this._genMapGlyph();
};

TextureFont.prototype.getFontSize = function(){
    return this._fontSize;
};

TextureFont.prototype._getKerningValue = function(leftChar,rightChar){
    if(leftChar == null || rightChar == null){
        return 0;
    }
    var mapGlyph = this._glyphs;
    return this._font.getKerningValue(mapGlyph[leftChar],mapGlyph[rightChar]) * this._scale;
};

TextureFont.prototype._genMapGlyph = function(){
    var chars = this._charsSupported,
        keys = chars.split(''); // for sort

    var font    = this._font,
        fSize   = this._fontSize,
        fBounds = this._fontMetrics.bounds;
        fBounds.min.toMax();
        fBounds.max.toMin();

    var glyphs   = this._glyphs = {},
        gMetrics = this._glyphMetrics = {},
        gBounds  = new Rect(),
        gBoundsUniform = new Rect();

    var scale = this._scale;

    var glyph, metrics;
    var gXMin, gXMax, gYMin, gYMax;
    var gPathCmds, gPathCmd;
    var gPoints = [];
    var gMaxSize = Vec2.min();

    var key, k, i, l;

    i = -1; l = chars.length;

    while(++i < l){
        key = chars[i];
        glyph = glyphs[key] = font.charToGlyph(key);

        gXMin = glyph.xMin * scale;
        gYMin = glyph.yMax * scale * -1;
        gXMax = glyph.xMax * scale;
        gYMax = glyph.yMin * scale * -1;

        if(gXMin == 0 && gYMin == 0 &&
           gXMax == 0 && gYMax == 0 && glyph.path){
            // fallback
            gPathCmds = glyph.path.commands;
            l = gPoints.length = gPathCmds.length;
            i = -1;
            while(++i < l){
                gPathCmd   = gPathCmds[i];
                gPoints[i] = new Vec2(gPathCmd.x * scale, gPathCmd.y * scale);
            }
            gBounds.includePoints(gPoints);
        } else {
            gBounds.setf(gXMin,gYMin,
                             gXMax,gYMax);
        }

        gBounds.min.x -= GLYPH_PADDING;
        gBounds.min.y -= GLYPH_PADDING;
        gBounds.max.x += GLYPH_PADDING;
        gBounds.max.y += GLYPH_PADDING;

        gMaxSize.x = Math.max(gMaxSize.x, gBounds.getWidth());
        gMaxSize.y = Math.max(gMaxSize.y, gBounds.getHeight());

        fBounds.include(gBounds);

        metrics = gMetrics[key] = new GlyphMetrics();
        metrics.bounds.set(gBounds);
        metrics.uniformBounds.set(gBounds);
        metrics.advanceWidth = glyph.advanceWidth * scale;
        metrics.leftSideBearing = glyph.leftSideBearing * scale;
    }

    for(k in keys){
        key = keys[k];
        gBoundsUniform = gMetrics[key].uniformBounds;
        gBoundsUniform.min.y = fBounds.min.y;
        gBoundsUniform.max.y = fBounds.max.y;
    }

    // sort on height

    keys.sort(function(a,b){
        var aheight = gMetrics[a].bounds.getHeight(),
            bheight = gMetrics[b].bounds.getHeight();
        return aheight < bheight ? 1 : aheight > bheight ? -1 : 0;
    });

    // gen gl texture
    // no rectangle packing for now

    var canvas = document.createElement('canvas');
    var canvasSize = this._textureSize.toZero(),
        canvasSizeInv = new Vec2();

    var ctx = canvas.getContext('2d');

    var gTexInfos = this._glyphTextureInfos = {},
        gTexInfo;

    var gOffset = new Vec2(),
        gOffsetYBase = fBounds.getHeight(),
        gSize,
        gSizeUniform, // glyph bounds equal font max bounds heights
        gTexcoordsMin,
        gTexcoordsMax;

    i = -1;
    l = keys.length;

    while(++i < l){
        key = keys[i];
        metrics = gMetrics[key];
        gSize = metrics.bounds.getSize();
        gSizeUniform = metrics.uniformBounds.getSize();

        if((gOffset.x + gSizeUniform.x) >= GLYPH_TABLE_TEX_MAX_WIDTH){
            gOffset.x = 0;
            gOffset.y+= gOffsetYBase;
            gOffsetYBase = gSizeUniform.y;
        }

        gTexInfo = gTexInfos[key] = new GlyphTextureInfo();
        gTexInfo.offset.set(gOffset);
        gTexInfo.size.set(gSizeUniform);

        gTexInfo.baseOffset = gSizeUniform.y - gSize.y;


        gOffset.x += gSizeUniform.x;
        canvasSize.x   = Math.max(gOffset.x, canvasSize.x);
        canvasSize.y   = Math.max(gOffset.y, canvasSize.y);
    }

    canvasSize.y   += gOffsetYBase;
    canvasSizeInv.x = 1.0 / canvasSize.x;
    canvasSizeInv.y = 1.0 / canvasSize.y;

    canvas.width  = canvasSize.x;
    canvas.height = canvasSize.y;

    var j, cmd, cmds;

    ctx.fillStyle = '#fff';

    i = -1;
    while(++i < l){
        key = keys[i];

        gTexInfo = gTexInfos[key];
        gOffset  = gTexInfo.offset;
        gBounds  = gMetrics[key].uniformBounds;

        ctx.save();
        ctx.translate(gOffset.x + gBounds.min.x * -1,
                      gOffset.y + gBounds.min.y * -1);

        cmds = glyphs[key].getPath(0,0,fSize).commands;

        j = -1;
        k = cmds.length;

        ctx.beginPath();
        while(++j < k){
            cmd = cmds[j];
            if (cmd.type === 'M') {
                ctx.moveTo(cmd.x, cmd.y);
            } else if (cmd.type === 'L') {
                ctx.lineTo(cmd.x, cmd.y);
            } else if (cmd.type === 'C') {
                ctx.bezierCurveTo(cmd.x1, cmd.y1, cmd.x2, cmd.y2, cmd.x, cmd.y);
            } else if (cmd.type === 'Q') {
                ctx.quadraticCurveTo(cmd.x1, cmd.y1, cmd.x, cmd.y);
            } else if (cmd.type === 'Z') {
                ctx.closePath();
            }
        }
        ctx.fill();
        ctx.restore();

        gSize         = gTexInfo.size;
        gTexcoordsMin = gTexInfo.texcoordsMin;
        gTexcoordsMax = gTexInfo.texcoordsMax;

        // draw every glyph with some padding to prevent overlapping

        gTexcoordsMin.set(gOffset).addf(GLYPH_PADDING,GLYPH_PADDING);
        gSize.subf(GLYPH_PADDING_2_MARGIN,GLYPH_PADDING_2_MARGIN);

        gTexcoordsMax.set(gTexcoordsMin).add(gSize);
        gTexcoordsMin.mult(canvasSizeInv);
        gTexcoordsMax.mult(canvasSizeInv);
    }

    var gl = this._gl;
    var texture = this._texture,
        texturePrev = gl.getParameter(gl.TEXTURE_BINDING_2D);

    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
    gl.bindTexture(gl.TEXTURE_2D, texturePrev);
};

var COLOR_WHITE = Color.white();

TextureFont.prototype.drawString = function(str,color){
    var strLast = this._stringLast;
    var strLastMax = this._stringLastMax;
    var strLen = str.length;

    if(strLen == 0){
        return;
    }

    var strChars = removeDuplicates(str);
    var glyphs   = this._glyphs;
    var i = -1, l = strChars.length;
    var error = 0;
    while(++i < l){
        if(!glyphs[strChars[i]]){
            console.log('Warning: Char not supported: ' + strChars[i]);
            error++;
        }
    }

    if(error > 0){
        return;
    }

    var gl      = this._gl,
        program = gl.getParameter(gl.CURRENT_PROGRAM);

    // fetch current program states
    if(program != this._programRefLast){
        this._attribLocationVertexPos    = gl.getAttribLocation(program,Program.ATTRIB_VERTEX_POSITION);
        this._attribLocationVertexColor  = gl.getAttribLocation(program,Program.ATTRIB_VERTEX_COLOR);
        this._attribLocationVertexNormal = gl.getAttribLocation(program,Program.ATTRIB_VERTEX_NORMAL);
        this._attribLocationTexcoord     = gl.getAttribLocation(program,Program.ATTRIB_TEXCOORD);

        this._uniformLocationModelViewMatrix  = gl.getUniformLocation(program,Program.UNIFORM_MODELVIEW_MATRIX);
        this._uniformLocationProjectionMatrix = gl.getUniformLocation(program,Program.UNIFORM_PROJECTION_MATRIX);
        this._uniformLocationTexture          = gl.getUniformLocation(program,Program.UNIFORM_TEXTURE);

        this._programRefLast = program;
    }

    var attribLocationVertexPos    = this._attribLocationVertexPos ,
        attribLocationVertexColor  = this._attribLocationVertexColor,
        attribLocationVertexNormal = this._attribLocationVertexNormal,
        attribLocationTexcoord     = this._attribLocationTexcoord;
    var uniformLocationModelViewMatrix  = this._uniformLocationModelViewMatrix,
        uniformLocationProjectionMatrix = this._uniformLocationProjectionMatrix,
        uniformLocationTexture          = this._uniformLocationTexture;

    if(attribLocationVertexPos == -1){
        return;
    }

    color = color || COLOR_WHITE;

    var numVertices = strLen * GLYPH_NUM_VERTICES;

    var texture     = this._texture,
        prevTexture = gl.getParameter(gl.TEXTURE_BINDING_2D);
    var prevVbo = gl.getParameter(gl.ARRAY_BUFFER_BINDING);

    var bufferVertex   = this._bufferVertex,
        bufferNormal   = this._bufferNormal,
        bufferColor    = this._bufferColor,
        bufferTexcoord = this._bufferTexcoord;

    var vertexData   = this._bufferVertexData,
        normalData   = this._bufferNormalData,
        colorData    = this._bufferColorData,
        texcoordData = this._bufferTexcoordData;

    if(str != strLast){
        var char;

        var textureInfos = this._glyphTextureInfos,
            textureInfo;
        var metrics = this._glyphMetrics,
            metric;
        var texcoordMin,
            texcoordMax,
            size;

        var j, k;

        var v0 = this._v0,
            v1 = this._v1,
            v2 = this._v2,
            v3 = this._v3;

        var uv0 = this._uv0,
            uv1 = this._uv1,
            uv2 = this._uv2,
            uv3 = this._uv3;

        var prevAdvance = 0;

        var colorR = color.r,
            colorG = color.g,
            colorB = color.b,
            colorA = color.a;

        var kerning;
        var prevAdvanceWidth = 0;

        l = strLen;

        if(strLen > strLastMax.length){
            //update all buffers

            var vertexDataLen   = this._bufferDataVertexLen   = numVertices * 3,
                normalDataLen   = this._bufferDataNormalLen   = numVertices * 3,
                colorDataLen    = this._bufferDataColorLen    = numVertices * 4,
                texcoordDataLen = this._bufferDataTexcoordLen = numVertices * 2;


            vertexData   = this._bufferVertexData   = new Float32Array(vertexDataLen);
            normalData   = this._bufferNormalData   = new Float32Array(normalDataLen);
            colorData    = this._bufferColorData    = new Float32Array(colorDataLen);
            texcoordData = this._bufferTexcoordData = new Float32Array(texcoordDataLen);


            i = -1;
            while(++i < l){
                char = str[i];

                textureInfo = textureInfos[char];
                metric      = metrics[char];

                size        = textureInfo.size;
                texcoordMin = textureInfo.texcoordsMin;
                texcoordMax = textureInfo.texcoordsMax;

                v0.x = prevAdvance + metric.leftSideBearing;
                v0.y = 0;
                v1.x = v0.x + size.x;
                v1.y = v0.y;
                v2.x = v0.x;
                v2.y = v0.y + size.y;
                v3.x = v1.x;
                v3.y = v2.y;

                prevAdvance += metric.advanceWidth + this._getKerningValue(str[i-1],str[i]);

                uv0.x = texcoordMin.x;
                uv0.y = texcoordMin.y;
                uv1.x = texcoordMax.x;
                uv1.y = uv0.y;
                uv2.x = uv0.x;
                uv2.y = texcoordMax.y;
                uv3.x = uv1.x;
                uv3.y = uv2.y;


                //        1      0--1    0--1   2,3,1
                //       /|      | /     |  |
                //      / |      |/      |  |
                //     2--3      2       2--3


                j = i * GLYPH_NUM_VERTICES;
                // vertices
                k = j * 3;
                vertexData[k   ] = v0.x;
                vertexData[k+ 1] = v0.y;
                vertexData[k+ 2] = v0.z;

                vertexData[k+ 3] = v2.x;
                vertexData[k+ 4] = v2.y;
                vertexData[k+ 5] = v2.z;

                vertexData[k+ 6] = v1.x;
                vertexData[k+ 7] = v1.y;
                vertexData[k+ 8] = v1.z;

                vertexData[k+ 9] = v1.x;
                vertexData[k+10] = v1.y;
                vertexData[k+11] = v1.z;

                vertexData[k+12] = v2.x;
                vertexData[k+13] = v2.y;
                vertexData[k+14] = v2.z;

                vertexData[k+15] = v3.x;
                vertexData[k+16] = v3.y;
                vertexData[k+17] = v3.z;


                // normals
                normalData[k   ] = normalData[k+ 3] = normalData[k+ 6] =
                normalData[k+ 9] = normalData[k+12] = normalData[k+15] = 1.0;

                normalData[k+ 1] = normalData[k+ 2] = normalData[k+ 4] =
                normalData[k+ 5] = normalData[k+ 7] = normalData[k+ 8] =
                normalData[k+10] = normalData[k+11] = normalData[k+13] =
                normalData[k+14] = normalData[k+16] = normalData[k+17] = 0.0;


                // colors
                k = j * 4;
                colorData[k   ] = colorData[k+ 4] = colorData[k+ 8] =
                colorData[k+12] = colorData[k+16] = colorData[k+20] = colorR;

                colorData[k+ 1] = colorData[k+ 5] = colorData[k+ 9] =
                colorData[k+13] = colorData[k+17] = colorData[k+21] = colorG;

                colorData[k+ 2] = colorData[k+ 6] = colorData[k+10] =
                colorData[k+14] = colorData[k+18] = colorData[k+22] = colorB;

                colorData[k+ 3] = colorData[k+ 7] = colorData[k+11] =
                colorData[k+15] = colorData[k+19] = colorData[k+23] = colorA;

                // texcoord
                k = j * 2;
                texcoordData[k   ] = uv0.x;
                texcoordData[k+ 1] = uv0.y;

                texcoordData[k+ 2] = uv2.x;
                texcoordData[k+ 3] = uv2.y;

                texcoordData[k+ 4] = uv1.x;
                texcoordData[k+ 5] = uv1.y;

                texcoordData[k+ 6] = uv1.x;
                texcoordData[k+ 7] = uv1.y;

                texcoordData[k+ 8] = uv2.x;
                texcoordData[k+ 9] = uv2.y;

                texcoordData[k+10] = uv3.x;
                texcoordData[k+11] = uv3.y;

            }

            gl.bindBuffer(gl.ARRAY_BUFFER,bufferVertex);
            gl.bufferData(gl.ARRAY_BUFFER,vertexData,gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER,bufferNormal);
            gl.bufferData(gl.ARRAY_BUFFER,normalData,gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER,bufferColor);
            gl.bufferData(gl.ARRAY_BUFFER,colorData,gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER,bufferTexcoord);
            gl.bufferData(gl.ARRAY_BUFFER,texcoordData,gl.DYNAMIC_DRAW);

            this._colorLast = !this._colorLast ? color.copy() : this._colorLast.set(color);

        } else {
            //just update the vertex buffer & texcoord buffer

            i = -1;
            while(++i < l){
                char = str[i];

                textureInfo = textureInfos[char];
                metric      = metrics[char];

                size        = textureInfo.size;
                texcoordMin = textureInfo.texcoordsMin;
                texcoordMax = textureInfo.texcoordsMax;

                v0.x = prevAdvance + metric.leftSideBearing;
                v0.y = 0;
                v1.x = v0.x + size.x;
                v1.y = v0.y;
                v2.x = v0.x;
                v2.y = v0.y + size.y;
                v3.x = v1.x;
                v3.y = v2.y;

                prevAdvance += metric.advanceWidth + this._getKerningValue(str[i-1],str[i]);

                uv0.x = texcoordMin.x;
                uv0.y = texcoordMin.y;
                uv1.x = texcoordMax.x;
                uv1.y = uv0.y;
                uv2.x = uv0.x;
                uv2.y = texcoordMax.y;
                uv3.x = uv1.x;
                uv3.y = uv2.y;

                j = i * GLYPH_NUM_VERTICES;
                // vertices
                k = j * 3;
                vertexData[k   ] = v0.x;
                vertexData[k+ 1] = v0.y;
                vertexData[k+ 2] = v0.z;

                vertexData[k+ 3] = v2.x;
                vertexData[k+ 4] = v2.y;
                vertexData[k+ 5] = v2.z;

                vertexData[k+ 6] = v1.x;
                vertexData[k+ 7] = v1.y;
                vertexData[k+ 8] = v1.z;

                vertexData[k+ 9] = v1.x;
                vertexData[k+10] = v1.y;
                vertexData[k+11] = v1.z;

                vertexData[k+12] = v2.x;
                vertexData[k+13] = v2.y;
                vertexData[k+14] = v2.z;

                vertexData[k+15] = v3.x;
                vertexData[k+16] = v3.y;
                vertexData[k+17] = v3.z;

                // texcoord
                k = j * 2;
                texcoordData[k   ] = uv0.x;
                texcoordData[k+ 1] = uv0.y;

                texcoordData[k+ 2] = uv2.x;
                texcoordData[k+ 3] = uv2.y;

                texcoordData[k+ 4] = uv1.x;
                texcoordData[k+ 5] = uv1.y;

                texcoordData[k+ 6] = uv1.x;
                texcoordData[k+ 7] = uv1.y;

                texcoordData[k+ 8] = uv2.x;
                texcoordData[k+ 9] = uv2.y;

                texcoordData[k+10] = uv3.x;
                texcoordData[k+11] = uv3.y;
            }

            gl.bindBuffer(gl.ARRAY_BUFFER,bufferVertex);
            gl.bufferData(gl.ARRAY_BUFFER,vertexData,gl.DYNAMIC_DRAW);
            gl.bindBuffer(gl.ARRAY_BUFFER,bufferTexcoord);
            gl.bufferData(gl.ARRAY_BUFFER,texcoordData,gl.DYNAMIC_DRAW);

            if(!color.equals(this._colorLast)){
                i = -1;
                while(++i < l){
                    j = i * GLYPH_NUM_VERTICES * 4;
                    colorData[j  ] = color.r;
                    colorData[j+1] = color.g;
                    colorData[j+2] = color.b;
                    colorData[j+3] = color.a;
                }

                gl.bindBuffer(gl.ARRAY_BUFFER,bufferColor);
                gl.bufferData(gl.ARRAY_BUFFER,colorData,gl.DYNAMIC_DRAW);

                this._colorLast = !this._colorLast ? color.copy() : this._colorLast.set(color);
            }
        }
    }

    gl.bindTexture(gl.TEXTURE_2D, texture);

    gl.bindBuffer(gl.ARRAY_BUFFER,bufferVertex);
    gl.vertexAttribPointer(attribLocationVertexPos,3,gl.FLOAT,false,0,0);

    if(attribLocationVertexColor != -1){
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferColor);
        gl.vertexAttribPointer(attribLocationVertexColor,4,gl.FLOAT,false,0,0);
    }
    if(attribLocationVertexNormal != -1){
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferNormal);
        gl.vertexAttribPointer(attribLocationVertexNormal,3,gl.FLOAT,false,0,0);
    }
    if(attribLocationTexcoord != -1){
        gl.bindBuffer(gl.ARRAY_BUFFER, bufferTexcoord);
        gl.vertexAttribPointer(attribLocationTexcoord,2,gl.FLOAT,false,0,0);
    }

    gl.uniformMatrix4fv(uniformLocationModelViewMatrix, false, glTrans.getModelViewMatrixF32());
    gl.uniformMatrix4fv(uniformLocationProjectionMatrix,false, glTrans.getProjectionMatrixF32());

    gl.drawArrays(gl.TRIANGLES,0,numVertices);

    gl.bindTexture(gl.TEXTURE_2D, prevTexture);
    gl.bindBuffer(gl.ARRAY_BUFFER, prevVbo);

    this._stringLast = str;
    this._stringLastMax = str.length > strLastMax.length ? str : strLastMax;
};

TextureFont.prototype.measureText = function(str){

}

TextureFont.prototype.getGlyphTableGLTexture = function(){
    return this._texture;
}

TextureFont.prototype.getGlyphTableGLTextureSize = function(v){
    return this._textureSize.copy(v);
}


module.exports = TextureFont;