import { extractSourceProductFacts, buildSourceDerivedListingDetail } from './source-derived-copy.js';

export const COPY_RULE_VERSION = 15;
export const COPY_STORE_IDS = ['4', '5', '6', '7', '8', '9', '2仓1', '2仓2', '2仓3', '2仓4'];
export const countTitleCharacters = text => Array.from(String(text || '').normalize('NFC')).length;
const plain = text => String(text || '').normalize('NFKC').normalize('NFC').replace(/\s+/g, ' ').trim();
const key = text => plain(text).toLocaleLowerCase('vi').replace(/[\p{P}\p{S}]/gu, '').replace(/\s+/g, ' ').trim();

// Reviewed product facts, not a general serum template. Exact brand, line and
// size must match before these product-specific claims may be used.
const BLEMISH_SOURCES = [
  'https://www.skinceuticals.com/skincare/oil-free-serums/blemish-plus-age-defense/S11.html?dwvar_S11_size=30ml',
  'https://www.skinceuticals.sg/en_SG/skincare-serums/blemish-age-defense-30ml/635494391206.html'
];
const BLEMISH_SUFFIXES = [
  'hỗ trợ giảm dầu thừa và bít tắc lỗ chân lông',
  'dành cho da dầu, hỗ trợ cải thiện bề mặt da',
  'công thức không dầu, chăm sóc da có khuyết điểm',
  'hỗ trợ thông thoáng lỗ chân lông cho da dầu',
  'hỗ trợ đều màu da, chăm sóc da dầu và hỗn hợp',
  'hỗ trợ giảm bóng dầu, cải thiện vẻ ngoài làn da',
  'công thức không dầu cho da dễ có khuyết điểm',
  'chăm sóc da dầu có dấu hiệu lão hóa và bít tắc',
  'hỗ trợ cải thiện bề mặt và sắc da không đồng đều',
  'chăm sóc lỗ chân lông và dấu hiệu lão hóa trên da'
];
const BLEMISH_INTROS = [
  'Da thường bóng dầu và dễ bít tắc? Tinh chất này tập trung vào lượng dầu thừa và vẻ ngoài của lỗ chân lông trong quy trình chăm sóc da.',
  'Khi làn da vừa có khuyết điểm vừa bắt đầu xuất hiện dấu hiệu lão hóa, việc chọn đúng tinh chất sẽ giúp quy trình chăm sóc có trọng tâm hơn.',
  'Một công thức không dầu dành cho nhu cầu chăm sóc da dầu và da hỗn hợp. Blemish + Age Defense kết hợp chăm sóc khuyết điểm với cải thiện vẻ ngoài bề mặt da.',
  'Lỗ chân lông dễ bít tắc là mối quan tâm chính của bạn? Blemish + Age Defense là tinh chất chăm sóc da, được dùng sau bước làm sạch theo hướng dẫn sản phẩm.',
  'Da không đều màu đi cùng tình trạng dầu thừa có thể khiến việc lựa chọn sản phẩm khó hơn. Đây là tinh chất hướng đến nhiều nhu cầu trên cùng làn da.',
  'Chọn tinh chất theo đúng vấn đề da đang gặp phải: dầu thừa, lỗ chân lông bít tắc và các dấu hiệu tuổi tác là những trọng tâm của dòng sản phẩm này.',
  'Bạn đang tìm một tinh chất không dầu cho quy trình riêng? Phiên bản Blemish + Age Defense 30ml thuộc bước chăm sóc sau làm sạch.',
  'Làn da trưởng thành vẫn có thể gặp khuyết điểm. Dòng tinh chất này hướng đến da dầu, da hỗn hợp và nhu cầu cải thiện các dấu hiệu lão hóa nhìn thấy được.',
  'Bề mặt và sắc da thiếu đồng đều là hai điểm cần quan tâm khi xây dựng quy trình cho da dầu. Blemish + Age Defense mang đến lựa chọn tinh chất phù hợp hướng chăm sóc đó.',
  'Tập trung vào đúng dòng và đúng dung tích: SkinCeuticals Blemish + Age Defense 30ml là tinh chất không dầu dành cho quy trình chăm sóc da có khuyết điểm.'
];
const BLEMISH_BENEFITS = [
  'Hỗ trợ giảm dầu thừa và tình trạng bít tắc lỗ chân lông; đồng thời cải thiện vẻ ngoài của sắc da không đồng đều.',
  'Hướng đến khuyết điểm trên da trưởng thành, đồng thời hỗ trợ cải thiện nếp nhăn nhỏ nhìn thấy trên bề mặt da.',
  'Đặc điểm nổi bật là công thức không dầu; lợi ích chăm sóc tập trung vào dầu thừa, khuyết điểm và vẻ ngoài làn da.',
  'Hỗ trợ cải thiện tình trạng lỗ chân lông bít tắc, đi cùng chăm sóc dầu thừa và các dấu hiệu lão hóa có thể nhìn thấy.',
  'Bổ sung hướng chăm sóc sắc da không đồng đều, bên cạnh khả năng hỗ trợ giảm dầu thừa và bít tắc.',
  'Chú trọng kiểm soát lượng dầu thừa và cải thiện vẻ ngoài của khuyết điểm, thay vì hứa hẹn thay đổi da tức thì.',
  'Công thức không dầu hỗ trợ chăm sóc lỗ chân lông và bề mặt da; hiệu quả cảm nhận tùy tình trạng thực tế.',
  'Kết hợp hỗ trợ giảm bít tắc với cải thiện vẻ ngoài của các dấu hiệu lão hóa trong cùng một bước tinh chất.',
  'Hỗ trợ cải thiện vẻ ngoài da không đều màu, đồng thời hướng đến lượng dầu thừa và tình trạng lỗ chân lông bít tắc.',
  'Một lựa chọn tập trung vào dầu thừa, lỗ chân lông và dấu hiệu tuổi tác; không thay thế việc làm sạch da trước khi thoa.'
];
const BLEMISH_AUDIENCE = [
  'Ưu tiên người có da dầu hoặc da hỗn hợp đang quan tâm đến lỗ chân lông bít tắc.',
  'Dành cho nhu cầu chăm sóc da có khuyết điểm đồng thời quan tâm các dấu hiệu tuổi tác.',
  'Phù hợp hướng lựa chọn tinh chất không dầu cho da dầu, da hỗn hợp; đối chiếu độ phù hợp cá nhân trước khi dùng.',
  'Hướng đến làn da dễ gặp khuyết điểm và cần chăm sóc bít tắc trong quy trình riêng.',
  'Có thể cân nhắc khi da dầu hoặc da hỗn hợp đi cùng sắc da thiếu đồng đều.',
  'Dành cho người muốn tập trung quy trình vào dầu thừa và khuyết điểm trên da.',
  'Hướng tới người cần tinh chất Blemish + Age Defense để bổ sung bước chăm sóc sau làm sạch.',
  'Ưu tiên nhu cầu chăm sóc làn da trưởng thành có dầu thừa, bít tắc hoặc khuyết điểm.',
  'Dành cho da dầu, da hỗn hợp đang quan tâm vẻ ngoài bề mặt và màu da.',
  'Cân nhắc theo tình trạng dầu thừa, bít tắc và dấu hiệu lão hóa của chính làn da bạn.'
];
const BLEMISH_USAGE = [
  'Sau khi làm sạch, lấy lượng tinh chất theo hướng dẫn trên bao bì và thoa một lớp mỏng lên vùng cần chăm sóc.',
  'Bắt đầu với da đã làm sạch; cho tinh chất ra tay sạch rồi tán mỏng theo chỉ dẫn của sản phẩm.',
  'Dùng ở bước tinh chất trên da sạch, phân bố một lớp mỏng tại vùng cần chăm sóc theo nhãn sản phẩm.',
  'Làm sạch da trước, sau đó dùng tinh chất theo hướng dẫn và tán mỏng thay vì thoa dày nhiều lớp.',
  'Thoa lớp tinh chất mỏng sau bước làm sạch. Lượng và tần suất sử dụng cần đối chiếu chỉ dẫn trên chai.',
  'Giữ tay sạch khi lấy tinh chất; dùng sau làm sạch và phủ một lớp mỏng lên vùng cần chăm sóc.',
  'Đưa sản phẩm vào bước tinh chất sau làm sạch; làm theo lượng dùng và tần suất được ghi trên bao bì.',
  'Sau bước làm sạch, thoa mỏng tinh chất theo hướng dẫn sản phẩm; không tự tăng lượng để mong hiệu quả nhanh hơn.',
  'Lấy tinh chất bằng tay sạch, tán nhẹ một lớp mỏng trên da đã làm sạch và tuân thủ hướng dẫn sử dụng.',
  'Hoàn tất làm sạch trước khi thoa tinh chất. Đọc chỉ dẫn trên bao bì để chọn đúng lượng và tần suất.'
];
const BLEMISH_CAUTIONS = [
  'Nếu dùng buổi sáng, tiếp tục bước chống nắng. Đánh giá hiệu quả theo tình trạng da thực tế và hướng dẫn của sản phẩm.',
  'Ban ngày cần kết hợp bước chống nắng theo hướng dẫn. Đây là sản phẩm chăm sóc da; mức độ phù hợp tùy từng người.',
  'Theo dõi phản ứng của da trong quá trình sử dụng và kết hợp chống nắng khi dùng buổi sáng.',
  'Duy trì chống nắng trong quy trình buổi sáng; đánh giá sự phù hợp theo phản ứng thực tế của da.',
  'Khi dùng buổi sáng, hoàn thiện quy trình bằng chống nắng. Không xem nội dung sản phẩm là bảo đảm kết quả cá nhân.',
  'Sử dụng đúng hướng dẫn và kết hợp chống nắng ban ngày; không tự xem việc thoa nhiều hơn là cách tăng hiệu quả.',
  'Đọc kỹ nhãn trước lần dùng đầu và tiếp tục bước chống nắng vào buổi sáng. Trải nghiệm giữa các làn da có thể khác nhau.',
  'Chống nắng là bước cần kết hợp vào buổi sáng; điều chỉnh quy trình theo hướng dẫn sản phẩm và sự phù hợp của da.',
  'Không kỳ vọng kết quả tức thì hoặc giống nhau trên mọi nền da; kết hợp chống nắng khi dùng trong quy trình ban ngày.',
  'Tôn trọng hướng dẫn sản phẩm, theo dõi độ phù hợp và hoàn tất bước chống nắng nếu sử dụng vào buổi sáng.'
];
const STORAGE = [
  'Đóng nắp sau khi dùng, giữ chai ở nơi khô mát và tránh ánh nắng trực tiếp.',
  'Cất chai nơi thoáng mát, hạn chế nguồn nhiệt và luôn đậy kín sau mỗi lần sử dụng.',
  'Giữ sản phẩm trong điều kiện bảo quản ghi trên nhãn; tránh đặt lâu dưới nắng hoặc cạnh nguồn nhiệt.',
  'Bảo quản chai kín nắp ở nơi khô thoáng, đồng thời kiểm tra hạn sử dụng trước khi dùng.',
  'Đặt sản phẩm tránh nắng trực tiếp, giữ phần nắp sạch và đóng kín khi không sử dụng.',
  'Sau khi lấy tinh chất, đậy nắp và đưa chai về vị trí khô mát theo chỉ dẫn bảo quản.',
  'Tránh để chai trong môi trường nóng kéo dài; giữ bao bì sạch và tuân thủ điều kiện trên nhãn.',
  'Chọn nơi cất thoáng mát, không để sản phẩm gần nguồn nhiệt; đóng kín nắp sau sử dụng.',
  'Giữ chai tránh ánh nắng, kiểm tra hạn trên bao bì và bảo quản theo chỉ dẫn của nhà sản xuất.',
  'Cất đúng điều kiện ghi trên bao bì, đậy nắp cẩn thận và tránh nhiệt độ cao hoặc ánh nắng trực tiếp.'
];

function blemishProduct(productName) {
  const normalized = plain(productName).toLowerCase();
  return /skinceuticals/.test(normalized) && /blemish\s*\+?\s*(?:and\s*)?age\s*defen[cs]e/.test(normalized)
    && /\b30\s*ml\b/.test(normalized);
}

export function makeAuditedListing({ productName, notes = '', storeId }) {
  const index = COPY_STORE_IDS.indexOf(String(storeId));
  if (index < 0) throw new Error(`Unsupported copy store: ${storeId}`);
  if (ageProduct(productName)) return makeAgeListing(index);
  if (advancedCreamProduct(productName)) return makeAgeListing(index, true, specificationKeys(productName).filter(spec => !spec.endsWith('%')).join(' '));
  if (blemishProduct(productName)) {
    const title = fitProductTitle('Tinh chất SkinCeuticals Blemish + Age Defense 30ml', BLEMISH_SUFFIXES[index]);
    const detail = [
      'SkinCeuticals Blemish + Age Defense 30ml', BLEMISH_INTROS[index],
      'Đặc điểm nổi bật', BLEMISH_BENEFITS[index],
      'Đối tượng phù hợp', BLEMISH_AUDIENCE[index],
      'Cách dùng', BLEMISH_USAGE[index],
      'Lưu ý khi sử dụng', BLEMISH_CAUTIONS[index],
      'Cách bảo quản', STORAGE[index]
    ].join('\n\n');
    return { title, detail };
  }
  const name = extractCoreProductName(productName);
  const facts = extractSourceProductFacts(plain(productName), notes);
  if (!facts) throw new Error('Không xác định được loại sản phẩm. Cần xác nhận tên và loại trước khi tạo nội dung.');
  const typeLabels = { skincare: 'chăm sóc da', cleanser: 'làm sạch da', makeup: 'trang điểm', fragrance: 'nước hoa', lip: 'trang điểm môi', hair: 'chăm sóc tóc', bodycare: 'chăm sóc cơ thể' };
  const angles = ['thông tin sản phẩm và cách sử dụng', 'đúng dòng, đúng dung tích bạn cần', 'lựa chọn theo nhu cầu cá nhân', 'hướng dẫn sử dụng và bảo quản', 'tìm hiểu sản phẩm trước khi chọn', 'chăm sóc theo hướng dẫn sản phẩm', 'nhận diện dòng sản phẩm phù hợp', 'chọn sản phẩm cho quy trình riêng', 'thông tin rõ ràng trước khi mua', 'sử dụng phù hợp nhu cầu thực tế'];
  // Put the distinctive phrase before category text so fitting never removes
  // the only difference between stores. Audit still rejects any collision.
  const titleCandidates = [angles[index], `${angles[index]}, ${typeLabels[facts.category]}`,
    `${angles[index]} theo hướng dẫn`, `${angles[index]} theo hướng dẫn trên bao bì`,
    `${angles[index]}, xem hướng dẫn trước khi dùng`, `${angles[index]}, đối chiếu thông tin trên nhãn`];
  let title;
  for (const angle of titleCandidates) {
    const candidate = `${name}, ${angle}`;
    if (countTitleCharacters(candidate) >= 90 && countTitleCharacters(candidate) <= 100) { title = candidate; break; }
  }
  if (!title) title = fitProductTitle(name, `${angles[index]}, ${typeLabels[facts.category]}`);
  const original = buildSourceDerivedListingDetail({ sourceTitle: plain(productName), notes, storeId });
  const openings = [
    'Bắt đầu từ việc chọn đúng dòng sản phẩm cho nhu cầu của bạn.',
    'Đối chiếu tên phiên bản trước khi bổ sung vào quy trình cá nhân.',
    'Một lựa chọn cần được cân nhắc theo tình trạng và mục đích sử dụng thực tế.',
    'Hãy dành thời gian đọc hướng dẫn để sử dụng đúng loại sản phẩm đang chọn.',
    'Tên dòng sản phẩm là điểm đầu tiên cần kiểm tra trước khi quyết định mua.',
    'Xây dựng quy trình phù hợp bắt đầu với việc hiểu đúng sản phẩm.',
    'Chọn theo nhu cầu riêng và kiểm tra phiên bản ghi trên bao bì.',
    'Giữ quy trình rõ ràng bằng cách xác nhận đúng sản phẩm cần sử dụng.',
    'Thông tin tên dòng giúp bạn đối chiếu lựa chọn với sản phẩm đang tìm.',
    'Trước khi thêm sản phẩm mới, hãy cân nhắc cách dùng và nhu cầu cá nhân.'
  ];
  const description = `Đây là sản phẩm thuộc nhóm ${typeLabels[facts.category]}. ${openings[index]}`;
  // Retain category-specific instructions. Unique introductions, guidance and
  // storage are composed separately rather than shuffling the same full body.
  const detail = [name, openings[index], 'Thông tin sản phẩm', description,
    original.split('\n').slice(1).join('\n'), 'Trước khi sử dụng',
    `${angles[index][0].toUpperCase()}${angles[index].slice(1)}. Đối chiếu cách dùng, tần suất và vị trí sử dụng trên bao bì; không suy ra liều lượng từ tên sản phẩm.`,
    'Bảo quản sau sử dụng', STORAGE[index]].join('\n\n');
  return { title, detail };
}

export function extractCoreProductName(value) {
  const name = plain(value);
  const descriptiveTail = name.match(/^(.*?)\s+(?:Kem Dưỡng|Kem Duong|Tinh Chất|Tinh Chat)\s+/iu);
  if (descriptiveTail && descriptiveTail[1].length > 15 && !/\b(?:shade|bundle|set|màu)\b/iu.test(name)) {
    const size = name.match(/\b\d+(?:[.,]\d+)?\s*(?:ml|g|kg|oz)\b/iu)?.[0];
    return descriptiveTail[1] + (size && !descriptiveTail[1].includes(size) ? ` ${size}` : '');
  }
  // Only remove a recognisable descriptive tail AFTER the product's size.
  // Never discard shade/model/bundle identity when its meaning is uncertain.
  const match = name.match(/^(.*?\b\d+(?:[.,]\d+)?\s*(?:ml|g|kg|oz))\s+(?:Tinh Chất|Tinh Chat|Săn Chắc|San Chac|Kiềm Dầu|Kiem Dau)\b/iu);
  return match ? match[1] : name;
}

const AGE_SOURCE = 'https://www.skinceuticals.com/skincare/anti-aging-serum/a.g.e.-interrupter-ultra-serum/S125.html';
function ageProduct(name) {
  const value = plain(name).toLowerCase();
  return value.includes('skinceuticals') && /a\.?g\.?e\.?\s+interrupter ultra serum\s+30\s*ml\b/.test(value);
}
function advancedCreamProduct(name) {
  return /skinceuticals\s+a\.?g\.?e\.?\s+interrupter advanced\b/i.test(plain(name))
    && !/\b(?:eye|serum)\b/i.test(plain(name));
}
function makeAgeListing(index, cream = false, size = '') {
  const identity = cream ? `Kem dưỡng SkinCeuticals A.G.E. Interrupter Advanced${size ? ` ${size}` : ''}` : 'SkinCeuticals A.G.E. Interrupter Ultra Serum 30ml';
  const angles = [
    'tinh chất hỗ trợ săn chắc và cải thiện nếp nhăn',
    'chăm sóc da có dấu hiệu chảy xệ và thiếu săn chắc',
    'hỗ trợ cải thiện vẻ ngoài nếp nhăn và độ săn chắc',
    'tinh chất chăm sóc vùng trán, má, hàm và cổ',
    'hỗ trợ dưỡng ẩm, cải thiện vẻ ngoài da lão hóa',
    'chăm sóc độ săn chắc và bề mặt da có nếp nhăn',
    'tinh chất cho quy trình chăm sóc da thiếu săn chắc',
    'hỗ trợ cải thiện vẻ ngoài chảy xệ ở mặt và cổ',
    'chăm sóc nếp nhăn nhỏ và duy trì độ ẩm làn da',
    'tinh chất dưỡng da hướng đến vẻ ngoài săn chắc'
  ];
  const intros = [
    'Da thiếu săn chắc và nếp nhăn là mối quan tâm chính của bạn? Dòng A.G.E. Interrupter Ultra Serum hướng đến vẻ ngoài săn chắc hơn, cùng chăm sóc độ ẩm của da.',
    'Khi lựa chọn tinh chất cho da có dấu hiệu chảy xệ, hãy phân biệt đúng dòng Ultra Serum với kem dưỡng cùng tên. Đây là phiên bản tinh chất dung tích 30ml.',
    'Một bước tinh chất tập trung vào dấu hiệu tuổi tác nhìn thấy trên bề mặt da. A.G.E. Interrupter Ultra Serum kết hợp chăm sóc độ săn chắc với cải thiện vẻ ngoài nếp nhăn.',
    'Trán, má, đường viền hàm và cổ là những vùng được thương hiệu nhắc đến khi giới thiệu dòng tinh chất này. Sản phẩm hướng đến nhu cầu cải thiện vẻ ngoài thiếu săn chắc.',
    'Độ ẩm và độ săn chắc đều đáng được quan tâm trong quy trình cho da lão hóa. Phiên bản Ultra Serum bổ sung bước chăm sóc tinh chất với hai hướng nhu cầu đó.',
    'Nếu bề mặt da xuất hiện nếp nhăn và mất dần vẻ săn chắc, việc chọn đúng sản phẩm giúp quy trình có trọng tâm hơn. Đây là tinh chất A.G.E. Interrupter Ultra Serum.',
    'Bạn đang tìm tinh chất thay vì kem dưỡng A.G.E.? Ultra Serum là phiên bản riêng, được thương hiệu giới thiệu cho nhu cầu chăm sóc độ săn chắc và dấu hiệu tuổi tác.',
    'Vùng mặt và cổ có thể cần sự chú ý trong cùng một quy trình chăm sóc. Dòng Ultra Serum hướng đến vẻ ngoài chảy xệ, nếp nhăn và tình trạng thiếu săn chắc.',
    'Nếp nhăn nhỏ đi cùng thay đổi độ ẩm là hai nhu cầu thường được cân nhắc khi chọn tinh chất. A.G.E. Interrupter Ultra Serum tập trung vào vẻ ngoài da lão hóa.',
    'Chọn đúng tên dòng, kết cấu sản phẩm và dung tích trước khi mua: SkinCeuticals A.G.E. Interrupter Ultra Serum 30ml là tinh chất chăm sóc độ săn chắc của da.'
  ];
  const benefits = [
    'Hỗ trợ cải thiện vẻ ngoài nếp nhăn, nếp nhăn nhỏ và tình trạng da thiếu săn chắc; đồng thời bổ sung dưỡng ẩm.',
    'Tập trung vào vẻ ngoài chảy xệ và độ săn chắc ở các vùng mặt, cổ; lợi ích dưỡng ẩm bổ sung cho quy trình.',
    'Hướng đến nhiều dấu hiệu lão hóa có thể nhìn thấy, bao gồm nếp nhăn và vẻ ngoài thiếu đàn hồi, săn chắc.',
    'Hỗ trợ chăm sóc vẻ ngoài săn chắc tại trán, má, đường viền hàm và cổ theo định hướng của dòng sản phẩm.',
    'Bên cạnh cải thiện vẻ ngoài dấu hiệu tuổi tác, sản phẩm còn được thương hiệu giới thiệu với lợi ích dưỡng ẩm da.',
    'Chú trọng vẻ ngoài bề mặt có nếp nhăn và tình trạng chảy xệ, giúp định hướng một bước tinh chất chuyên biệt.',
    'Một lựa chọn tinh chất hướng đến chăm sóc độ săn chắc; giữ đúng phiên bản Ultra Serum khi đối chiếu với sản phẩm cần mua.',
    'Kết hợp chăm sóc độ săn chắc vùng mặt và cổ với hỗ trợ cải thiện vẻ ngoài nếp nhăn, không hứa hẹn thay đổi tức thì.',
    'Hỗ trợ cải thiện vẻ ngoài của nếp nhăn nhỏ và bổ sung độ ẩm trong quy trình chăm sóc dấu hiệu lão hóa.',
    'Đặc điểm chăm sóc tập trung vào độ săn chắc, nếp nhăn và vẻ ngoài chảy xệ; kết quả thực tế khác nhau giữa từng làn da.'
  ];
  const audience = [
    'Dành cho nhu cầu chăm sóc da có dấu hiệu tuổi tác, đặc biệt khi quan tâm nếp nhăn và độ săn chắc.',
    'Cân nhắc khi bạn cần đúng phiên bản tinh chất cho quy trình chăm sóc vẻ ngoài da chảy xệ.',
    'Hướng tới người ưu tiên cải thiện vẻ ngoài nếp nhăn trong một quy trình chăm sóc phù hợp cá nhân.',
    'Phù hợp hướng lựa chọn sản phẩm tập trung vào vẻ ngoài vùng trán, má, hàm và cổ.',
    'Dành cho người quan tâm đồng thời đến dưỡng ẩm và các dấu hiệu lão hóa nhìn thấy trên da.',
    'Ưu tiên nhu cầu chăm sóc bề mặt có nếp nhăn, kèm thay đổi độ săn chắc theo thời gian.',
    'Hướng tới người đã xác nhận cần A.G.E. Interrupter Ultra Serum, không phải phiên bản kem dưỡng.',
    'Cân nhắc khi vùng mặt và cổ là trọng tâm trong quy trình chăm sóc dấu hiệu tuổi tác của bạn.',
    'Dành cho nhu cầu chăm sóc nếp nhăn nhỏ và độ ẩm, với lựa chọn phù hợp tình trạng da thực tế.',
    'Hướng đến người muốn bổ sung một bước tinh chất chăm sóc độ săn chắc và vẻ ngoài làn da.'
  ];
  const usage = BLEMISH_USAGE[index] + ' Lượng dùng, tần suất và thứ tự cụ thể cần theo nhãn của Ultra Serum.';
  const detail = [identity, intros[index], 'Đặc điểm nổi bật', benefits[index], 'Đối tượng phù hợp', audience[index], 'Cách dùng', usage, 'Lưu ý', 'Đối chiếu hướng dẫn trên bao bì trước khi kết hợp với sản phẩm khác. Hiệu quả cảm nhận tùy tình trạng da; sản phẩm không thay thế tư vấn chuyên môn.', 'Cách bảo quản', STORAGE[index]].join('\n\n');
  if (cream) {
    const creamAngles = angles.map(x => x.replace(/tinh chất/g, 'kem dưỡng'));
    const creamTitle = fitProductTitle(identity, creamAngles[index]);
    const creamDetail = [identity, 'Đặc điểm nổi bật', benefits[index].replace(/tinh chất/g, 'kem dưỡng'),
      'Nhu cầu chăm sóc', audience[index].replace(/tinh chất/g, 'kem dưỡng').replace(/A\.G\.E\. Interrupter Ultra Serum/g, 'A.G.E. Interrupter Advanced').replace(/không phải phiên bản kem dưỡng/g, 'đúng phiên bản kem dưỡng'),
      'Cách dùng', BLEMISH_USAGE[index].replace(/tinh chất/g, 'kem dưỡng') + ' Đối chiếu lượng dùng và tần suất trên bao bì của Advanced.',
      'Lưu ý khi lựa chọn', `Phiên bản đang giới thiệu là A.G.E. Interrupter Advanced dạng kem. ${STORAGE[(index + 3) % 10]}`,
      'Cách bảo quản', STORAGE[index],
      'Trước khi sử dụng', `Theo dõi độ phù hợp của da và đọc hướng dẫn trước khi kết hợp sản phẩm. ${audience[(index + 4) % 10].replace(/tinh chất/g, 'kem dưỡng').replace(/A\.G\.E\. Interrupter Ultra Serum/g, 'A.G.E. Interrupter Advanced').replace(/không phải phiên bản kem dưỡng/g, 'đúng phiên bản kem dưỡng')}`].join('\n\n');
    return {title:creamTitle, detail:creamDetail.replace(/Ultra Serum/g, 'Advanced').replace(/chai/g, 'sản phẩm')};
  }
  return { title: fitProductTitle(identity, angles[index]), detail };
}

function fitProductTitle(identity, angle) {
  const base = plain(identity);
  // Never cut brand/model/volume just to squeeze a marketing phrase in.
  if (countTitleCharacters(base) > 95) throw new Error('Product identity is too long; confirm a concise exact product name before generating.');
  const starts = [`${base}, ${angle}`, `${base} - ${angle}`, `${angle}: ${base}`];
  for (const title of starts) if (countTitleCharacters(title) >= 90 && countTitleCharacters(title) <= 100) return title;
  const words = plain(angle).split(' ');
  for (let count = words.length; count > 0; count--) {
    const title = `${base}, ${words.slice(0, count).join(' ')}`;
    if (countTitleCharacters(title) >= 90 && countTitleCharacters(title) <= 100 && !/\b(?:và|cho|của|với|theo|tại|trên)$/u.test(title)) return title;
  }
  for (const tail of [' theo nhu cầu', ' phù hợp nhu cầu', ' trong quy trình chăm sóc', ' theo hướng dẫn trên bao bì']) {
    const title = `${base}, ${angle}${tail}`;
    if (countTitleCharacters(title) >= 90 && countTitleCharacters(title) <= 100) return title;
  }
  throw new Error('Cannot form a natural 90–100 character title without padding or cutting product identity.');
}

export function makeAuditedListings({ productName, notes = '', storeIds = COPY_STORE_IDS }) {
  const listings = Object.fromEntries(storeIds.map(storeId => [storeId, makeAuditedListing({ productName, notes, storeId })]));
  const audit = auditListingSet(listings, { productName, notes, storeIds });
  if (!audit.valid) throw new Error(audit.errors.join(' '));
  return listings;
}

export function auditListingSet(listings, { productName = '', notes = '', storeIds = Object.keys(listings || {}) } = {}) {
  const errors = [];
  const reviewedProduct = blemishProduct(productName) || ageProduct(productName) || advancedCreamProduct(productName);
  const warnings = reviewedProduct ? [] : ['新品使用通用文案规则：请核对功效、使用方法和各店购买角度；格式审核通过不代表事实或营销质量已经人工审核。'];
  const referenceSpecs = specificationKeys(`${productName}\n${notes}`);
  const titleSpecs = specificationKeys(productName).filter(spec => !spec.endsWith('%'));
  const seenTitles = new Map(), seenDetails = new Map();
  const rows = [];
  const serum = blemishProduct(productName) || /\b(?:serum|tinh chat)\b/.test(fold(productName));
  for (const storeId of storeIds) {
    const listing = listings?.[storeId];
    if (!listing) { errors.push(`${storeId}: missing listing.`); continue; }
    const { title = '', detail = '' } = listing;
    const length = countTitleCharacters(title.trim());
    const titleKey = key(title), detailKey = key(detail);
    if (length < 90 || length > 100) errors.push(`${storeId}: title must be 90–100 characters (received ${length}).`);
    if (seenTitles.has(titleKey)) errors.push(`${storeId}: duplicate title with ${seenTitles.get(titleKey)}.`);
    if (seenDetails.has(detailKey)) errors.push(`${storeId}: duplicate detail with ${seenDetails.get(detailKey)}.`);
    seenTitles.set(titleKey, storeId); seenDetails.set(detailKey, storeId);
    if (/[\u{1D400}-\u{1D7FF}]/u.test(title)) errors.push(`${storeId}: use plain text, not mathematical styled letters.`);
    if (/[\u3400-\u9FFF\uFFFD]/u.test(title + detail)) errors.push(`${storeId}: Chinese or corrupted text in buyer copy.`);
    if (!/[à-ỹ]/iu.test(title) || !/[à-ỹ]/iu.test(detail)) errors.push(`${storeId}: Vietnamese diacritics required.`);
    const text = fold(`${title}\n${detail}`);
    if (/\b(?:chinh hang|authentic|official|cam ket|chua khoi|tri dut diem|hieu qua tuc thi|tot nhat|ban chay so 1|sku|shopee)\b|100%/.test(text)) errors.push(`${storeId}: unsupported guarantee, superlative or internal/platform wording.`);
    if (serum && /(?:tao bot|rua sach (?:voi|bang) nuoc|lam uot mat|sua rua mat)/.test(fold(detail).replace(/khong phai sua rua mat/g, '').replace(/khong phai san pham lam sach can tao bot/g, ''))) errors.push(`${storeId}: serum copy contains cleanser instructions.`);
    if (blemishProduct(productName) && (!/skinceuticals/i.test(title) || !/blemish\s*\+\s*age defense/i.test(title) || !/30\s*ml/i.test(title))) errors.push(`${storeId}: product identity or volume changed.`);
    if (ageProduct(productName) && !(` ${key(title)} `).includes(` ${key('SkinCeuticals A.G.E. Interrupter Ultra Serum 30ml')} `)) errors.push(`${storeId}: product identity or volume changed.`);
    if (advancedCreamProduct(productName) && !(` ${key(title)} `).includes(` ${key('SkinCeuticals A.G.E. Interrupter Advanced')} `)) errors.push(`${storeId}: product identity changed.`);
    if (!reviewedProduct && productName && !key(title).includes(key(extractCoreProductName(productName)))) errors.push(`${storeId}: exact product identity must be preserved in title.`);
    for (const spec of titleSpecs) if (!specificationKeys(title).includes(spec)) errors.push(`${storeId}: source specification ${spec} is missing from title.`);
    for (const spec of specificationKeys(`${title}\n${detail}`)) if (!referenceSpecs.includes(spec)) errors.push(`${storeId}: unsupported specification ${spec}; verify against source.`);
    if (detail.length < 600 || detail.length > 2500) errors.push(`${storeId}: detail must be 600–2500 characters.`);
    const paragraphs = paragraphKeys(detail);
    for (const row of rows) {
      const shared = [...paragraphs].filter(p => row.paragraphs.has(p)).length;
      if (shared / Math.max(1, Math.min(paragraphs.size, row.paragraphs.size)) > 0.65) errors.push(`${storeId}: detail reuses too much of ${row.storeId}; rewrite paragraphs instead of reordering.`);
      else if (nearDuplicateParagraphRatio(paragraphs, row.paragraphs) > 0.8) errors.push(`${storeId}: detail is too similar to ${row.storeId}; changing a few words does not create a distinct description.`);
    }
    rows.push({ storeId, titleLength: length, detailLength: detail.length, paragraphs });
  }
  return { valid: errors.length === 0, errors, warnings, reviewLevel: reviewedProduct ? 'product_rules' : 'generic_rules', rows: rows.map(({ paragraphs, ...row }) => row), sources: blemishProduct(productName) ? BLEMISH_SOURCES : ageProduct(productName) ? [AGE_SOURCE] : advancedCreamProduct(productName) ? ['https://www.skinceuticals.com/skincare/anti-aging-creams/a.g.e.-interrupter-advanced/S117.html'] : [], version: COPY_RULE_VERSION };
}

function specificationKeys(text) {
  return [...new Set([...plain(text).matchAll(/\b(\d+(?:[.,]\d+)?)\s*(ml|kg|g|oz|%)(?![a-z])/giu)].map(match => `${Number(match[1].replace(',', '.'))}${match[2].toLowerCase()}`))];
}

function nearDuplicateParagraphRatio(a, b) {
  const left = [...a], right = [...b];
  const similarity = (x, y) => {
    const xWords = new Set(fold(x).split(' ')), yWords = new Set(fold(y).split(' '));
    const shared = [...xWords].filter(word => yWords.has(word)).length;
    return shared / Math.max(1, xWords.size + yWords.size - shared);
  };
  // One-to-one matching prevents a single generic sentence matching an entire detail.
  const edges = left.flatMap((line, i) => right.map((other, j) => ({ i, j, score: similarity(line, other) }))).filter(edge => edge.score >= 0.82).sort((a, b) => b.score - a.score);
  const usedLeft = new Set(), usedRight = new Set();
  for (const edge of edges) if (!usedLeft.has(edge.i) && !usedRight.has(edge.j)) { usedLeft.add(edge.i); usedRight.add(edge.j); }
  return usedLeft.size / Math.max(1, Math.min(left.length, right.length));
}

function paragraphKeys(detail) {
  return new Set(String(detail || '').split(/\n+/).map(key).filter(line => line.length > 45));
}
function fold(value) {
  return plain(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').replace(/Đ/g, 'D').toLowerCase();
}
