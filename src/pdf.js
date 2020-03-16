import jsPDF from 'jspdf';
import html2canvas from 'html2canvas';

const A4_WIDTH = 592.28;
const A4_HEIGHT = 841.89;

jsPDF.API.output2 = function (outputType = 'save', filename = 'document.pdf') {
    let result = null;
    switch (outputType) {
        case 'file':
            result = new File([this.output('blob')], filename, {
                type: 'application/pdf',
                lastModified: Date.now(),
            });
            break;
        case 'save':
            result = this.save(filename);
            break;
        default:
            result = this.output(outputType);
    }
    return result;
};

jsPDF.API.addBlank = function (x, y, width, height) {
    this.setFillColor(255, 255, 255);
    this.rect(x, y, Math.ceil(width), Math.ceil(height), 'F');
};

jsPDF.API.toCanvas = async function (element, width) {
    const canvas = await html2canvas(element);
    const canvasWidth = canvas.width;
    const canvasHeight = canvas.height;
    const height = (width / canvasWidth) * canvasHeight;
    const canvasData = canvas.toDataURL('image/jpeg', 1.0);
    return { width, height, data: canvasData };
};

jsPDF.API.addHeader = async function (x, width, header) {
    if (!(header instanceof HTMLElement)) return;
    let __header;
    if (this.__header) {
        __header = this.__header;
    } else {
        __header = await this.toCanvas(header, width);
        this.__header = __header;
    }
    const { height, data } = __header;
    this.addImage(data, 'JPEG', x, 0, width, height);
};

jsPDF.API.addFooter = async function (x, width, footer) {
    if (!(footer instanceof HTMLElement)) return;
    let __footer;
    if (this.__footer) {
        __footer = this.__footer;
    } else {
        __footer = await this.toCanvas(footer, width);
        this.__footer = __footer;
    }
    const { height, data } = __footer;
    this.addImage(data, 'JPEG', x, A4_HEIGHT - height, width, height);
};

/**
 * 生成pdf(处理多页pdf截断问题)
 * @param {Object} param
 * @param {HTMLElement} param.element - 需要转换的dom根节点
 * @param {number} [param.contentWidth=550] - 一页pdf的内容宽度，0-592.28
 * @param {number} [param.contentHeight=800] - 一页pdf的内容高度，0-841.89
 * @param {string} [param.outputType='save'] - 生成pdf的数据类型，添加了'file'类型，其他支持的类型见http://raw.githack.com/MrRio/jsPDF/master/docs/jsPDF.html#output
 * @param {string} [param.filename='document.pdf'] - pdf文件名
 * @param {number} param.x - pdf页内容距页面左边的高度，默认居中显示，为(A4宽度 - contentWidth) / 2)
 * @param {number} param.y - pdf页内容距页面上边的高度，默认居中显示，为(A4高度 - contentHeight) / 2)
 * @param {HTMLElement} param.header - 页眉dom元素
 * @param {HTMLElement} param.footer - 页脚dom元素
 * @param {boolean} [param.headerOnlyFirst=true] - 是否只在第一页添加页眉
 * @param {boolean} [param.footerOnlyLast=true] - 是否只在最后一页添加页脚
 * @param {string} [param.mode='adaptive'] - 生成pdf的模式，支持'adaptive'、'fixed'，'adaptive'需给dom添加标识，'fixed'需固定布局。
 * @param {string} [param.itemName='item'] - 给dom添加元素标识的名字，'adaptive'模式需在dom中设置
 * @param {string} [param.groupName='group'] - 给dom添加组标识的名字，'adaptive'模式需在dom中设置
 * @returns {Promise} 根据outputType返回不同的数据类型
 */
async function outputPdf ({
                              element, contentWidth = 550, contentHeight = 800,
                              outputType = 'save', filename = 'document.pdf', x, y,
                              header, footer, headerOnlyFirst = true, footerOnlyLast = true,
                              mode = 'adaptive', itemName = 'item', groupName = 'group',
                          }) {
    if (!(element instanceof HTMLElement)) {
        throw new Error('The root element must be HTMLElement.');
    }

    const pdf = new jsPDF({
        unit: 'pt',
        format: 'a4',
        orientation: 'p',
    });
    const { width, height, data } = await pdf.toCanvas(element, contentWidth);
    const baseX = x == null ? (A4_WIDTH - contentWidth) / 2 : x;
    const baseY = y == null ? (A4_HEIGHT - contentHeight) / 2 : y;
    async function addHeader (isFirst) {
        if (isFirst || !headerOnlyFirst) {
            await pdf.addHeader(baseX, contentWidth, header);
        }
    }
    async function addFooter (isLast) {
        if (isLast || !footerOnlyLast) {
            await pdf.addFooter(baseX, contentWidth, footer);
        }
    }
    function addImage (_x, _y) {
        pdf.addImage(data, 'JPEG', _x, _y, width, height);
    }

    const params = {
        element, contentWidth, contentHeight, itemName, groupName,
        pdf, baseX, baseY, width, height, addImage, addHeader, addFooter,
    };
    switch (mode) {
        case 'adaptive':
            await outputWithAdaptive(params);
            break;
        case 'fixed':
        default:
            await outputWithFixedSize(params);
    }
    return pdf.output2(outputType, filename);
}

async function outputWithFixedSize ({
                                        pdf, baseX, baseY, height, addImage, addHeader, addFooter, contentHeight,
                                    }) {
    const pageNum = Math.ceil(height / contentHeight); // 总页数
    const arr = Array.from({ length: pageNum }).map((_, i) => i);
    for await (const i of arr) {
        addImage(baseX, baseY - i * contentHeight);
        const isFirst = i === 0;
        const isLast = i === arr.length - 1;
        if (!isFirst) {
            // 用空白遮挡顶部需要隐藏的部分
            pdf.addBlank(0, 0, A4_WIDTH, baseY);
        }
        if (!isLast) {
            // 用空白遮挡底部需要隐藏的部分
            pdf.addBlank(0, baseY + contentHeight, A4_WIDTH, A4_HEIGHT - (baseY + contentHeight));
        }
        await addHeader(isFirst);
        await addFooter(isLast);
        if (!isLast) {
            pdf.addPage();
        }
    }
}

async function outputWithAdaptive ({
                                       element, contentWidth, itemName, groupName,
                                       pdf, baseX, baseY, addImage, addHeader, addFooter, contentHeight,
                                   }) {
    // 从根节点遍历dom，计算出每页应放置的内容高度以保证不被截断
    const splitElement = () => {
        const res = [];
        let pos = 0;
        const elementWidth = element.offsetWidth;
        function updatePos (height) {
            if (pos + height <= contentHeight) {
                pos += height;
                return;
            }
            res.push(pos);
            pos = height;
        }
        function traversingNodes (nodes) {
            if (nodes.length === 0) return;
            nodes.forEach(one => {
                if (one.nodeType !== 1) return;
                const { [itemName]: item, [groupName]: group } = one.dataset;
                if (item != null) {
                    const { offsetHeight } = one;
                    // dom高度转换成生成pdf的实际高度
                    // 代码不考虑dom定位、边距、边框等因素，需在dom里自行考虑，如将box-sizing设置为border-box
                    updatePos(contentWidth / elementWidth * offsetHeight);
                } else if (group != null) {
                    traversingNodes(one.childNodes);
                }
            });
        }
        traversingNodes(element.childNodes);
        res.push(pos);
        return res;
    };

    const elements = splitElement();
    let accumulationHeight = 0;
    let currentPage = 0;
    for await (const elementHeight of elements) {
        addImage(baseX, baseY - accumulationHeight);
        accumulationHeight += elementHeight;
        const isFirst = currentPage === 0;
        const isLast = currentPage === elements.length - 1;
        if (!isFirst) {
            pdf.addBlank(0, 0, A4_WIDTH, baseY);
        }
        if (!isLast) {
            pdf.addBlank(0, baseY + elementHeight, A4_WIDTH, A4_HEIGHT - (baseY + elementHeight));
        }
        await addHeader(isFirst);
        await addFooter(isLast);
        if (!isLast) {
            pdf.addPage();
        }
        currentPage++;
    }
}

export default outputPdf;
