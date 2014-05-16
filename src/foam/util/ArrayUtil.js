var ObjectUtil = require('./ObjectUtil');

var ArrayUtil = {
    createArray: function (length) {
        var args = Array.prototype.slice.call(arguments, 1);

        var argsLen = args.length;
        var arr = [];
        if (argsLen == 0) {
            arr.length = length;
            return arr;
        }
        length = length * argsLen;
        var i = 0;
        while (arr.length != length) {
            arr.push(args[(i++) % argsLen])
        }
        return arr;
    },

    appendArray: function (a, b) {
        a.push.apply(a, b);
    },

    toArray: function (a) {
        return Array.prototype.slice.call(a);
    },

    setArrayObj : function (arr, index) {
        var args = Array.prototype.slice.call(arguments, 2);
        var argsLen = args.length;
        if(argsLen == 0){
            return;
        }

        index *= argsLen;
        var i = -1;
        while(++i < argsLen){
            arr[index + i] = args[i];
        }
    },

    setArrayObj2: function (arr, index, obj2) {
        index *= 2;
        arr[index    ] = obj2[0];
        arr[index + 1] = obj2[1];
    },

    setArrayObj3: function (arr, index, obj3) {
        index *= 3;
        arr[index  ] = obj3[0];
        arr[index + 1] = obj3[1];
        arr[index + 2] = obj3[2];
    },

    setArrayObj4: function (arr, index, obj4) {
        index *= 4;
        arr[index    ] = obj4[0];
        arr[index + 1] = obj4[1];
        arr[index + 2] = obj4[2];
        arr[index + 3] = obj4[3];
    },

    forEachObj2 : function(arr,func,offset,length){
        var i = !offset ? 0 : offset,
            l = ObjectUtil.isUndefined(length) ? arr.length : length < offset ? offset : length;
        while(i < l){
            func(arr,i);
            i += 2;
        }
    },

    forEachObj3 : function(arr,func,offset,length){
        var i = !offset ? 0 : offset,
            l = ObjectUtil.isUndefined(length) ? arr.length : length < offset ? offset : length;
        while(i < l){
            func(arr,i);
            i += 3;
        }
    },

    forEachObj4 : function(arr,func,offset,length){
        var i = !offset ? 0 : offset,
            l = ObjectUtil.isUndefined(length) ? arr.length : length < offset ? offset : length;
        while(i < l){
            func(arr,i);
            i += 4;
        }
    }
};

module.exports = ArrayUtil;