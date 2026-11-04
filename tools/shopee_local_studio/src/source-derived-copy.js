const HEADINGS = Object.freeze([
  "Công dụng chính",
  "Đối tượng phù hợp",
  "Cảm giác khi dùng",
  "Cách dùng",
  "Cách bảo quản"
]);

const COMMON_STORAGE = [
  "- Bảo quản nơi khô mát, tránh ánh nắng trực tiếp và nhiệt độ cao.",
  "- Đóng kín nắp sau khi dùng để giữ sản phẩm sạch và ổn định.",
  "- Không để sản phẩm lâu trong xe nóng hoặc gần nguồn nhiệt.",
  "- Để xa tầm tay trẻ em và sử dụng trong hạn ghi trên bao bì.",
  "- Giữ bao bì khô sạch, tránh khu vực có độ ẩm quá cao.",
  "- Ngừng sử dụng nếu sản phẩm đổi màu, đổi mùi hoặc quá hạn."
];

const RULES = Object.freeze({
  fragrance: {
    benefits: [
      "- Giữ đúng tên phiên bản, dung tích và đối tượng sử dụng từ thông tin sản phẩm gốc.",
      "- Mùi hương giúp hoàn thiện phong cách cá nhân trong sinh hoạt hằng ngày.",
      "- Dễ lựa chọn cho nhiều hoàn cảnh như đi làm, gặp gỡ hoặc đi chơi.",
      "- Thiết kế chai phù hợp trưng bày hoặc làm quà khi đã chọn đúng phiên bản.",
      "- Có thể điều chỉnh số lần xịt theo không gian và sở thích cá nhân.",
      "- Hương thơm tạo điểm nhấn riêng mà không thay đổi đặc tính sản phẩm gốc.",
      "- Phù hợp mang theo khi cần làm mới mùi hương trong ngày.",
      "- Nội dung chỉ dùng những thông tin có thể xác nhận từ sản phẩm nguồn."
    ],
    audience: [
      "- Phù hợp người yêu thích nước hoa và muốn tạo dấu ấn mùi hương cá nhân.",
      "- Phù hợp sử dụng hằng ngày hoặc trong những dịp cần hình ảnh chỉn chu.",
      "- Phù hợp người đã xác nhận đúng phiên bản nước hoa cần mua.",
      "- Phù hợp người cần sản phẩm tạo hương dễ dùng trước khi ra ngoài.",
      "- Phù hợp làm quà khi người nhận đã biết và yêu thích đúng phiên bản này.",
      "- Nên thử mùi thực tế nếu người dùng nhạy cảm với hương liệu."
    ],
    sensation: [
      "- Mùi hương được cảm nhận rõ hơn khi xịt lượng vừa phải tại các điểm mạch.",
      "- Ấn tượng hương có thể thay đổi theo thời gian, nhiệt độ và cơ địa mỗi người.",
      "- Nên thử lượng nhỏ trước để chọn số lần xịt phù hợp với không gian sử dụng.",
      "- Trải nghiệm hương tự nhiên hơn khi không xịt quá gần hoặc quá nhiều.",
      "- Độ lưu hương thực tế có thể khác nhau tùy môi trường và cách sử dụng.",
      "- Mùi hương trên giấy thử và trên cơ thể có thể cho cảm nhận khác nhau."
    ],
    usage: [
      "- Xịt lượng vừa phải lên cổ tay, sau tai hoặc vùng cổ từ khoảng cách phù hợp.",
      "- Không chà xát hai cổ tay sau khi xịt để tránh làm thay đổi quá trình tỏa hương.",
      "- Tránh xịt trực tiếp vào mặt, mắt, vùng da kích ứng hoặc vết thương hở.",
      "- Có thể xịt lại khi cần, ưu tiên lượng vừa đủ trong không gian kín.",
      "- Thử trước trên vùng nhỏ nếu da nhạy cảm với sản phẩm có hương liệu.",
      "- Đợi mùi hương ổn định vài phút trước khi quyết định xịt thêm."
    ],
    storage: [
      "- Đặt chai thẳng đứng ở nơi khô mát, tránh ánh nắng trực tiếp và nguồn nhiệt.",
      "- Đóng kín nắp sau khi dùng để hạn chế bay hơi và giữ vòi xịt sạch.",
      "- Không để sản phẩm trong xe nóng hoặc khu vực có nhiệt độ thay đổi liên tục.",
      "- Bảo quản xa tầm tay trẻ em và tránh gần nguồn lửa.",
      "- Giữ sản phẩm trong hộp khi ít sử dụng để hạn chế ánh sáng.",
      "- Không tự sang chiết nếu dụng cụ chứa không sạch hoặc không phù hợp."
    ]
  },
  lip: categoryRule({
    subject: "sản phẩm môi",
    benefit: "hoàn thiện lớp trang điểm môi",
    audience: "người muốn trang điểm môi nhanh và dễ điều chỉnh",
    sensation: "môi",
    usage: [
      "- Làm sạch môi, thoa một lớp mỏng từ giữa môi ra hai bên.",
      "- Dặm thêm tại vùng cần tăng màu hoặc hiệu ứng theo mong muốn.",
      "- Đậy kín nắp sau khi dùng và không dùng chung với người khác.",
      "- Ngừng sử dụng nếu môi xuất hiện dấu hiệu kích ứng bất thường.",
      "- Màu thực tế có thể khác nhẹ do nền môi, ánh sáng và màn hình.",
      "- Có thể dặm lại sau ăn uống tùy nhu cầu cá nhân."
    ]
  }),
  hair: categoryRule({
    subject: "sản phẩm chăm sóc tóc",
    benefit: "bổ sung vào quy trình chăm sóc tóc",
    audience: "người có nhu cầu chăm sóc tóc đúng với công dụng ghi trên sản phẩm",
    sensation: "tóc và da đầu",
    usage: [
      "- Sử dụng theo hướng dẫn trên bao bì và đúng vị trí dành cho tóc hoặc da đầu.",
      "- Điều chỉnh lượng dùng theo độ dài, độ dày và tình trạng tóc.",
      "- Tránh để sản phẩm tiếp xúc trực tiếp với mắt; rửa sạch nếu bị dính.",
      "- Ngừng sử dụng nếu da đầu xuất hiện dấu hiệu kích ứng bất thường.",
      "- Không dùng quá nhiều để hạn chế cảm giác nặng hoặc bết tóc.",
      "- Làm sạch tay và đóng kín nắp sau mỗi lần sử dụng."
    ]
  }),
  cleanser: categoryRule({
    subject: "sản phẩm làm sạch da",
    benefit: "bổ sung vào bước làm sạch hằng ngày",
    audience: "người cần đúng loại sản phẩm làm sạch ghi trên tiêu đề gốc",
    sensation: "da sau khi rửa",
    usage: [
      "- Làm ướt mặt, lấy lượng vừa đủ và tạo bọt nếu hướng dẫn sản phẩm yêu cầu.",
      "- Làm sạch nhẹ nhàng, tránh vùng mắt và vùng da đang kích ứng.",
      "- Rửa kỹ với nước rồi thấm khô bằng khăn sạch.",
      "- Ngừng sử dụng nếu xuất hiện dấu hiệu kích ứng bất thường.",
      "- Tránh chà xát mạnh hoặc để sản phẩm lưu quá lâu trên da.",
      "- Đối chiếu tần suất sử dụng với hướng dẫn trên bao bì."
    ]
  }),
  makeup: categoryRule({
    subject: "sản phẩm trang điểm",
    benefit: "hoàn thiện lớp trang điểm theo đúng công dụng",
    audience: "người cần đúng loại và đúng phiên bản trang điểm ghi trên tiêu đề gốc",
    sensation: "lớp trang điểm",
    usage: [
      "- Chuẩn bị da sạch, lấy lượng nhỏ và tán đều bằng dụng cụ phù hợp.",
      "- Tăng thêm từng lớp mỏng tại vùng cần điều chỉnh.",
      "- Tránh dùng trên vùng da đang kích ứng hoặc có vết thương hở.",
      "- Đậy kín nắp và vệ sinh dụng cụ trang điểm thường xuyên.",
      "- Cần tẩy trang và làm sạch da sau khi sử dụng.",
      "- Màu thực tế có thể khác nhẹ do ánh sáng và màn hình hiển thị."
    ]
  }),
  skincare: categoryRule({
    subject: "sản phẩm chăm sóc da",
    benefit: "bổ sung vào quy trình chăm sóc da theo đúng công dụng",
    audience: "người có nhu cầu chăm sóc da đúng với công dụng ghi trên sản phẩm",
    sensation: "da",
    usage: [
      "- Sử dụng trên da sạch theo thứ tự và hướng dẫn ghi trên bao bì sản phẩm.",
      "- Lấy lượng vừa đủ, thoa nhẹ và tránh vùng mắt nếu không có hướng dẫn riêng.",
      "- Thử trước trên vùng da nhỏ khi lần đầu sử dụng hoặc khi da nhạy cảm.",
      "- Ngừng sử dụng nếu xuất hiện dấu hiệu kích ứng bất thường.",
      "- Không tự kết hợp hoạt chất khi chưa xác nhận khả năng tương thích.",
      "- Điều chỉnh tần suất theo hướng dẫn và phản ứng thực tế của da."
    ]
  }),
  bodycare: categoryRule({
    subject: "sản phẩm chăm sóc cơ thể",
    benefit: "bổ sung vào quy trình chăm sóc cơ thể theo đúng công dụng",
    audience: "người cần đúng loại sản phẩm chăm sóc cơ thể ghi trên tiêu đề gốc",
    sensation: "da cơ thể",
    usage: [
      "- Sử dụng trên vùng da cơ thể sạch theo hướng dẫn ghi trên bao bì.",
      "- Lấy lượng vừa đủ và thoa nhẹ, tập trung ở vùng da cần chăm sóc.",
      "- Tránh vùng mặt, mắt, vùng da kích ứng hoặc vết thương hở.",
      "- Thử trước trên vùng da nhỏ khi lần đầu dùng hoặc khi da nhạy cảm.",
      "- Điều chỉnh lượng dùng theo diện tích da và kết cấu thực tế của sản phẩm.",
      "- Ngừng sử dụng nếu xuất hiện dấu hiệu kích ứng bất thường."
    ]
  })
});

const FORBIDDEN = Object.freeze({
  fragrance: ["serum", "toner", "kem dưỡng", "son môi", "tóc", "massage", "thoa đều", "lớp nền", "rửa mặt"],
  lip: ["cổ tay", "sau tai", "gội", "da đầu", "rửa mặt", "lớp nền"],
  hair: ["cổ tay", "sau tai", "son môi", "lớp nền", "rửa mặt"],
  cleanser: ["cổ tay", "sau tai", "son môi", "da đầu", "lớp nền"],
  makeup: ["cổ tay", "sau tai", "gội", "da đầu"],
  skincare: ["cổ tay", "sau tai", "gội", "da đầu", "son môi"],
  bodycare: ["cổ tay", "sau tai", "gội", "da đầu", "son môi", "lớp nền", "rửa mặt"]
});

export function extractSourceProductFacts(sourceTitle, notes = "") {
  const title = cleanText(sourceTitle);
  const sourceText = `${title} ${cleanText(notes)}`.trim();
  const key = asciiKey(sourceText);
  const category = detectCategory(asciiKey(title)) || detectCategory(key);
  if (!title || !category) return null;
  const volume = sourceText.match(/\b\d+(?:[.,]\d+)?\s*(?:ml|g|kg|oz)\b/i)?.[0] || "";
  const gender = /\b(?:nuoc hoa nam|pour homme|for men|men'?s|homme)\b/.test(key)
    ? "male"
    : /\b(?:nuoc hoa nu|pour femme|for women|women'?s|femme)\b/.test(key)
      ? "female"
      : "";
  return { title, sourceText, category, volume, gender };
}

export function buildSourceDerivedListingDetail({ sourceTitle, cleanName = "", notes = "", storeId = "" } = {}) {
  const facts = extractSourceProductFacts(sourceTitle || cleanName, notes);
  if (!facts) return null;
  const rules = RULES[facts.category];
  if (!rules) return null;
  const seed = stableHash(`${facts.title}|${storeId}`);
  const audience = pick(rules.audience, 2, seed + 29);
  if (facts.category === "fragrance" && facts.gender) {
    audience[0] = facts.gender === "male"
      ? "- Phù hợp nam giới yêu thích đúng phiên bản nước hoa ghi trong tiêu đề sản phẩm."
      : "- Phù hợp nữ giới yêu thích đúng phiên bản nước hoa ghi trong tiêu đề sản phẩm.";
  }
  const sections = [
    [HEADINGS[0], pick(rules.benefits, 5, seed + 11)],
    [HEADINGS[1], audience],
    [HEADINGS[2], pick(rules.sensation, 2, seed + 43)],
    [HEADINGS[3], pick(rules.usage, 3, seed + 71)],
    [HEADINGS[4], pick(rules.storage, 2, seed + 97)]
  ];
  const detail = [facts.title, ...sections.flatMap(([heading, lines]) => [heading, ...lines])].join("\n");
  validateSourceDerivedListingDetail(detail, facts);
  return detail;
}

export function validateSourceDerivedListingDetail(detail, facts) {
  const value = String(detail || "").trim();
  if (!value) throw new Error("Generated listing detail is empty.");
  for (const heading of HEADINGS) {
    if (!value.includes(heading)) throw new Error(`Generated listing detail is missing section: ${heading}`);
  }
  const body = value.split(/\r?\n/).slice(1).join("\n").toLocaleLowerCase("vi");
  const hit = (FORBIDDEN[facts?.category] || []).find((phrase) => body.includes(phrase.toLocaleLowerCase("vi")));
  if (hit) throw new Error(`Generated ${facts?.category || "product"} copy contains forbidden phrase: ${hit}`);
  if (facts?.category === "fragrance" && !/(?:hương|xịt|nước hoa)/iu.test(body)) {
    throw new Error("Generated fragrance copy does not contain fragrance-specific language.");
  }
  return true;
}

function categoryRule({ subject, benefit, audience, sensation, usage }) {
  return {
    benefits: [
      `- Giữ đúng tên dòng, dung tích và thông tin đã xác nhận của ${subject} nguồn.`,
      `- Dễ ${benefit} theo hướng dẫn trên bao bì.`,
      "- Nội dung không tự thêm thành phần hoặc hiệu quả chưa được xác nhận.",
      "- Có thể điều chỉnh lượng dùng theo nhu cầu và tình trạng thực tế.",
      "- Tập trung vào trải nghiệm sử dụng, không phóng đại công dụng.",
      "- Giúp người mua nhận diện đúng phiên bản trước khi lựa chọn.",
      "- Phù hợp quy trình cá nhân gọn gàng và dễ duy trì.",
      "- Công dụng chi tiết cần đối chiếu thêm với thông tin trên bao bì."
    ],
    audience: [
      `- Phù hợp ${audience}.`,
      "- Phù hợp người đã xác nhận đúng dòng, phiên bản và dung tích cần mua.",
      "- Nên đối chiếu thành phần và hướng dẫn trên bao bì trước khi sử dụng.",
      "- Phù hợp người muốn quy trình sử dụng rõ ràng, dễ thực hiện.",
      "- Người có cơ địa nhạy cảm nên thử trước trên vùng nhỏ.",
      "- Không thay thế tư vấn chuyên môn khi đang có vấn đề cần điều trị."
    ],
    sensation: [
      `- Cảm giác trên ${sensation} phụ thuộc lượng dùng và tình trạng của mỗi người.`,
      "- Nên bắt đầu với lượng nhỏ để theo dõi khả năng phù hợp.",
      "- Hiệu quả cảm nhận có thể khác nhau theo cách sử dụng thực tế.",
      "- Theo dõi phản ứng trong những lần sử dụng đầu tiên.",
      "- Không nên tăng lượng quá nhanh khi chưa đánh giá độ phù hợp.",
      "- Dừng sử dụng khi xuất hiện cảm giác khó chịu bất thường."
    ],
    usage,
    storage: COMMON_STORAGE
  };
}

function detectCategory(key) {
  if (/\b(?:kem duong|face cream|moisturizer)\b/.test(key)) return "skincare";
  if (/\b(?:perfume|parfum|fragrance|eau de parfum|eau de toilette|nuoc hoa|cologne)\b/.test(key)) return "fragrance";
  if (/\b(?:lip|lipstick|lip gloss|lip balm|son moi|son bong|son duong|rouge)\b/.test(key)) return "lip";
  if (/\b(?:shampoo|conditioner|hair|scalp|toc|dau goi|dau xa|kem u toc)\b/.test(key)) return "hair";
  if (/\b(?:cleanser|face wash|foam wash|sua rua mat|rua mat|lam sach da)\b/.test(key)) return "cleanser";
  if (/\b(?:foundation|concealer|cushion|primer|makeup base|bb cream|cc cream|blush|powder|kem nen|phan phu|ma hong)\b/.test(key)) return "makeup";
  if (/\b(?:body lotion|body cream|body oil|body butter|hand cream|foot cream|duong the|duong tay|dau duong the|kem duong the|cham soc co the)\b/.test(key)) return "bodycare";
  if (/\b(?:serum|tinh chat|toner|essence|moisturizer|face cream|eye cream|skincare|duong da|cap am|cham soc da|kem duong|lotion)\b/.test(key)) return "skincare";
  return "";
}

function pick(lines, count, seed) {
  return [...lines]
    .map((line, index) => ({ line, rank: stableHash(`${seed}|${index}|${line}`) }))
    .sort((a, b) => a.rank - b.rank || a.line.localeCompare(b.line))
    .slice(0, Math.min(count, lines.length))
    .map((item) => item.line);
}

function stableHash(value) {
  let hash = 2166136261;
  for (const char of String(value || "")) {
    hash ^= char.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function cleanText(value) {
  return String(value || "").replace(/[\u0000-\u001F\u007F]+/g, " ").replace(/\s+/g, " ").trim();
}

function asciiKey(value) {
  return String(value || "").normalize("NFKC").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D").toLowerCase();
}
