import type { ClinicalDocumentStore } from "../application/document-service.js";

interface S3ClientLike {
  send(command: unknown): Promise<unknown>;
}

interface S3Sdk {
  readonly S3Client: new (config: Record<string, unknown>) => S3ClientLike;
  readonly PutObjectCommand: new (input: Record<string, unknown>) => unknown;
  readonly GetObjectCommand: new (input: Record<string, unknown>) => unknown;
}

interface PresignerSdk {
  getSignedUrl(
    client: S3ClientLike,
    command: unknown,
    options: { expiresIn: number; signableHeaders?: Set<string> },
  ): Promise<string>;
}

export interface S3DocumentStoreOptions {
  readonly bucket: string;
  readonly region: string;
  /** Endpoint S3 compativel somente para desenvolvimento local (ex.: MinIO). */
  readonly endpoint?: string;
  readonly forcePathStyle?: boolean;
  readonly loadS3?: () => Promise<S3Sdk>;
  readonly loadPresigner?: () => Promise<PresignerSdk>;
}

export class S3ClinicalDocumentStore implements ClinicalDocumentStore {
  private dependencies?: Promise<{
    readonly client: S3ClientLike;
    readonly PutObjectCommand: S3Sdk["PutObjectCommand"];
    readonly GetObjectCommand: S3Sdk["GetObjectCommand"];
    readonly getSignedUrl: PresignerSdk["getSignedUrl"];
  }>;

  constructor(private readonly options: S3DocumentStoreOptions) {
    if (!options.bucket.trim() || !options.region.trim()) {
      throw new Error("Invalid clinical document store configuration.");
    }
  }

  async presignUpload(input: {
    key: string;
    contentType: string;
    sizeBytes: number;
    expiresInSeconds: number;
  }): Promise<string> {
    const { client, PutObjectCommand, getSignedUrl } = await this.getDependencies();
    return getSignedUrl(
      client,
      new PutObjectCommand({
        Bucket: this.options.bucket,
        Key: input.key,
        ContentType: input.contentType,
        ContentLength: input.sizeBytes,
      }),
      {
        expiresIn: input.expiresInSeconds,
        // The S3 presigner excludes content-type by default; opt it back into
        // the signature so clients cannot swap an approved clinical MIME type.
        signableHeaders: new Set(["content-length", "content-type"]),
      },
    );
  }

  async presignDownload(input: {
    key: string;
    expiresInSeconds: number;
  }): Promise<string> {
    const { client, GetObjectCommand, getSignedUrl } = await this.getDependencies();
    return getSignedUrl(
      client,
      new GetObjectCommand({ Bucket: this.options.bucket, Key: input.key }),
      { expiresIn: input.expiresInSeconds },
    );
  }

  private getDependencies(): Promise<{
    readonly client: S3ClientLike;
    readonly PutObjectCommand: S3Sdk["PutObjectCommand"];
    readonly GetObjectCommand: S3Sdk["GetObjectCommand"];
    readonly getSignedUrl: PresignerSdk["getSignedUrl"];
  }> {
    this.dependencies ??= Promise.all([
      (this.options.loadS3 ?? defaultS3Loader)(),
      (this.options.loadPresigner ?? defaultPresignerLoader)(),
    ]).then(([s3, presigner]) => ({
      client: new s3.S3Client({
        region: this.options.region,
        maxAttempts: 5,
        retryMode: "adaptive",
        // PutObject sem Body e usado apenas para assinatura. O default
        // WHEN_SUPPORTED do SDK pode fixar CRC32 de corpo vazio na URL e tornar
        // qualquer upload real invalido; S3 ainda valida os headers assinados.
        requestChecksumCalculation: "WHEN_REQUIRED",
        ...(this.options.endpoint ? { endpoint: this.options.endpoint } : {}),
        forcePathStyle: this.options.forcePathStyle ?? false,
      }),
      PutObjectCommand: s3.PutObjectCommand,
      GetObjectCommand: s3.GetObjectCommand,
      getSignedUrl: presigner.getSignedUrl,
    }));
    return this.dependencies;
  }
}

async function defaultS3Loader(): Promise<S3Sdk> {
  return (await import("@aws-sdk/client-s3")) as unknown as S3Sdk;
}

async function defaultPresignerLoader(): Promise<PresignerSdk> {
  return import("@aws-sdk/s3-request-presigner");
}
