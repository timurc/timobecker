import React from 'react';
import PATHS from './renderedPaths7.json';

let paper;

if (!process.env.STATIC) {
    paper = require('paper');
}

const BLEND_MODE = 'multiply';

const COLOR_PEN = '#e80101';
const COLOR_DOT = 'black';
const COLOR_LINE = 'black';

// forgot to define in the beginning -.-
const ORIGINAL_CANVAS_SIZE = 800;

const SIZES = {
    POINT_RADIUS: 1,
    PEN_STROKE_WIDTH: 1,
    LINE_STROKE_WIDTH: 2,
};

export default class Logo extends React.Component {
    init() {
        this.timers = [];

        if (this.props.order) {
            this.drawLine(this.PaperScope, this.points, this.props.order);
        }
        if (this.props.mode === 'paint') {
            this.initPaint();
        }
        if (this.props.mode === 'connect') {
            this.initConnectionLine();
            this.connectionCount = 0;
        }

        if (this.props.canvasResize) {
            this.setCanvasSize();
        }

        this.PaperScope.view.draw();
    }

    componentDidMount() {
        document.ontouchmove = function (event) {
            event.preventDefault();
        };

        this.SIZES_RELATIVE = Object.entries(SIZES).reduce((a, [key, value]) => {
            a[key] = this.getRelativeValue(value);
            return a;
        }, {});

        this.relativeMargin = this.getRelativeValue(this.props.margin);

        this.points = this.props.points.map((point) => {
            return point.map((position) => {
                const withoutMargin = this.getRelativeValue(position);
                return this.relativeMargin + (withoutMargin / 100) * (100 - this.props.margin * 2);
            });
        });

        setTimeout(() => {
            this.PaperScope = new paper.PaperScope();
            this.PaperScope.setup(this._canvas);

            this.masterGroup = new this.PaperScope.Group();

            this.drawPoints(this.PaperScope, this.points);

            this.init();

            this.PaperScope.view.onResize = () => this.setCanvasSize();
            this.setCanvasSize();
        }, 100);
    }

    componentDidUpdate(nextProps) {
        const currentOrder = this.props.order && this.props.order.join();
        const nextOrder = nextProps.order && nextProps.order.join();

        if (nextOrder !== currentOrder || this.props.painting !== nextProps.painting) {
            this.init();
        }

        if (this.props.canvasSize !== nextProps.canvasSize) {
            this.setCanvasSize(nextProps.canvasSize);
        }
    }

    componentWillUnmount() {
        document.ontouchmove = undefined;
        this.timers.forEach(timer => {
            clearTimeout(timer)
        })
        this.PaperScope.remove();
        // window._paq.push(['trackEvent', 'painting', 'connectionCount', this.connectionCount]);
    }

    setCanvasSize() {
        const size = this.PaperScope.view.viewSize;

        if (!this.originalPosition) {
            this.originalPosition = this.masterGroup.position;
        }

        this.masterGroup.position = new this.PaperScope.Point(size.width / 2, size.height / 2);

        if (this.paintGroup && this.paintGroup.children.length) {
            if (!this.paintGroupPositionTmp) {
                this.paintGroupPositionTmp = this.paintGroup.position;
            }

            const diff = this.masterGroup.position.subtract(this.originalPosition);

            this.paintGroup.position = this.paintGroupPositionTmp.add(diff);
        }

        this.PaperScope.view.draw();
    }

    drawLine(p, points, order) {
        this.initConnectionLine();

        order.forEach((index) => {
            this.line.add(new p.Point(points[index]));
        });

        this.line.add(new p.Point(points[order[0]]));
    }

    drawPoints(p, points) {
        const color = new p.Color(COLOR_DOT);

        const dot = new p.Path.Circle({
            center: [0, 0],
            radius: this.SIZES_RELATIVE.POINT_RADIUS,
            fillColor: color,
            blendMode: BLEND_MODE,
        });

        const connectionDot = new p.Path.Circle({
            center: [0, 0],
            radius: this.SIZES_RELATIVE.POINT_RADIUS * 4,
            fillColor: 'rgba(255,255,255,1)',
            blendMode: BLEND_MODE,
        });

        const symbol = new p.Symbol(dot);
        const connectionSymbol = new p.Symbol(connectionDot);

        this.placedDots = [];

        points.forEach((point, index) => {
            if (this.props.showLabels) {
                const pPoint = new p.Point(point);
                const label = new p.PointText(pPoint.add([-15, -8]));
                label.content = index;
            }

            this.masterGroup.addChild(symbol.place(point));

            if (this.props.mode === 'connect') {
                const connectionDotPlaced = connectionSymbol.place(point);
                connectionDotPlaced.onMouseEnter = this.addConnectionDot.bind(this, point, index);
                connectionDotPlaced.onMouseDown = this.addConnectionDot.bind(this, point, index);
                this.masterGroup.addChild(connectionDotPlaced);
                this.placedDots.push(connectionDotPlaced);
            }
        });
    }

    addConnectionDot(point, index, connectionDotPlaced) {
        const position = this.placedDots[index].position;

        if (this.line.closed) {
            return;
        }

        const p = this.PaperScope;

        if (!this.connectOrder.includes(index)) {
            this.line.add(new p.Point(position));
            this.connectOrder.push(index);

            if (this.mouseLineInitHappened) {
                if (this.mouseLine.segments.length === 1) {
                    this.mouseLine.add(new this.PaperScope.Point(position));
                } else {
                    this.mouseLine.lastSegment.point = position;
                }
            }
        }
        if (this.connectOrder.length === this.points.length) {
            this.dotConnectionFinished();
        }
    }

    dotConnectionFinished() {
        if (this.mouseLineInitHappened) {
            this.mouseLine.lastSegment.remove();
        }

        this.line.closed = true;
        this.currentlyPainting = true;
        const drawingIndex = PATHS.byKey[this.connectOrder.join('')];

        const paintingsLink = require('./paintingsSingle/' + drawingIndex + '.json');

        fetch(paintingsLink.default)
            .then((response) => {
                return response.json();
            })
            .then((painting) => {
                this.initPaint(painting);
            })
            .catch((ex) => {
                console.log('parsing failed', ex);
            });

        if (window._paq) {
            window._paq.push(['trackEvent', 'painting', 'connected', drawingIndex]);
        }
        this.connectionCount = this.connectionCount + 1;
    }

    getRelativeValue(value) {
        return (value / 100) * this.props.size;
    }

    initConnectionLine() {
        if (this.line) {
            this.line.remove();
        }

        this.line = new this.PaperScope.Path();
        this.line.strokeColor = COLOR_LINE;
        this.line.blendMode = BLEND_MODE;
        this.line.strokeWidth = this.SIZES_RELATIVE.LINE_STROKE_WIDTH;
        this.line.strokeJoin = 'round';
        this.line.closed = this.props.mode === 'paint';

        this.masterGroup.addChild(this.line);
        this.paintGroupPositionTmp = undefined;

        if (!this.mouseLine && this.props.mode === 'connect') {
            this.mouseLine = new this.PaperScope.Path();

            this.mouseLine.strokeColor = COLOR_LINE;
            this.mouseLine.blendMode = BLEND_MODE;
            this.mouseLine.strokeWidth = this.SIZES_RELATIVE.LINE_STROKE_WIDTH;
            this.mouseLine.strokeCap = 'round';
            this.mouseLine.sendToBack();

            this.PaperScope.view.onMouseMove = (event) => {
                if (!this.mouseLineInitHappened) {
                    this.mouseLine.add(new this.PaperScope.Point(0, 0));
                    this.mouseLineInitHappened = true;
                }

                this.mouseLine.firstSegment.point = event.point;
            };
        } else if (this.props.mode === 'connect') {
            if (this.mouseLine.segments.length !== 1 && this.mouseLineInitHappened) {
                this.mouseLine.lastSegment.remove();
            }
        }

        this.connectOrder = [];

        this.PaperScope.project.view.onMouseDown = () => {
            if (this.line.closed && !this.currentlyPainting) {
                this.reset();
            }
        };
    }

    initPaint(painting) {
        const p = this.PaperScope;

        const paths = [];
        const strokeWidth = this.SIZES_RELATIVE.PEN_STROKE_WIDTH;
        const that = this;

        if (!this.painter) {
            this.painter = new p.Tool();
        }

        if (this.paintGroup) {
            this.paintGroup.removeChildren();
        } else {
            this.paintGroup = new p.Group();
        }

        if (this.props.painting) {
            this.paintGroup.importJSON(this.props.painting);
        }

        if (painting) {
            const scaleFactor = this.props.size / ORIGINAL_CANVAS_SIZE;

            this.paintGroup.importJSON(painting);
            this.paintGroup.scale(scaleFactor, new p.Point(0, 0));
            this.paintGroup.strokeWidth *= scaleFactor;

            this.paintGroup.children.forEach((child, idx) => {
                child.opacity = 0;

                this.timers.push(setTimeout(() => {
                    child.opacity = 1;
                    this.setCanvasSize();
                    this.PaperScope.view.draw();

                    if (idx === this.paintGroup.children.length - 1) {
                        this.currentlyPainting = false;
                        if (this.props.typing) {
                            window.print();
                            setTimeout(() => {
                                this.reset();
                                // location.reload();
                            }, 5000);
                        }
                    }
                }, idx * 100));
            });
        }

        this.paintGroup.addChildren(paths);

        if (this.props.mode === 'paint') {
            this.painter.onMouseDown = onMouseDown;
            this.painter.onMouseDrag = onMouseDrag;
            this.painter.onMouseUp = onMouseUp;
        }

        function onMouseDown(event) {
            const path = new p.Path();
            path.strokeColor = new p.Color(COLOR_PEN);
            path.blendMode = BLEND_MODE;
            path.add(event.point);
            path.strokeWidth = strokeWidth;
            paths.push(path);
        }

        function onMouseDrag(event) {
            paths[paths.length - 1].add(event.point);
            paths[paths.length - 1].smooth();
        }

        function onMouseUp(event) {
            that.paintGroup.addChild(paths[paths.length - 1]);
            that.props.painted(that.paintGroup.exportJSON());
        }
    }

    reset() {
        this.initConnectionLine();
        this.initPaint();
        this.PaperScope.view.draw();
    }

    connect(dot) {
        this.addConnectionDot('foo', dot);
        this.PaperScope.view.draw();
    }

    render() {
        return (
            <canvas
                ref={(c) => (this._canvas = c)}
                className={this.props.className}
                width={this.props.size}
                height={this.props.size}
                data-paper-resize="true"
            />
        );
    }
}
