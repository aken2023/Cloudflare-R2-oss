export const onRequestGet: PagesFunction = async (context) => {
  const { env, params } = context;
  const bucket = env.R2_BUCKET as R2Bucket;
  const folderPath = params.path as string;

  // 列出文件夹下所有对象
  const objects = await bucket.list({ prefix: folderPath });

  if (!objects.objects.length) {
    return new Response("No files found", { status: 404 });
  }

  // 拼接所有文件数据流
  const stream = new ReadableStream({
    async start(controller) {
      for (const obj of objects.objects) {
        const file = await bucket.get(obj.key);
        if (!file) continue;

        // 读取文件内容
        const buf = await file.arrayBuffer();

        // 在流里加简单分隔（文件名标记）
        const separator = new TextEncoder().encode(`\n---FILE:${obj.key}---\n`);
        controller.enqueue(separator);
        controller.enqueue(new Uint8Array(buf));
      }
      controller.close();
    },
  });

  // 用 gzip 压缩
  const compressedStream = stream.pipeThrough(new CompressionStream("gzip"));

  return new Response(compressedStream, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="${folderPath}.tar.gz"`,
    },
  });
};
