import {
  BedrockRuntimeClient,
  InvokeModelCommand,
} from '@aws-sdk/client-bedrock-runtime'

/** Stable Diffusion 3.5 は us-west-2 でのみ利用可能 */
const BEDROCK_IMAGE_REGION = 'us-west-2'

function getBedrockClient(): BedrockRuntimeClient {
  return new BedrockRuntimeClient({
    region: process.env.BEDROCK_REGION ?? BEDROCK_IMAGE_REGION,
    credentials: {
      accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
      secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    },
  })
}

/**
 * AWS Bedrock Stable Diffusion 3.5 Large で画像を生成する
 * 戻り値：data:image/jpeg;base64,... 形式のURL（容量削減のため JPEG 出力）
 */
export async function generateImageWithFirefly(
  title: string,
  content: string
): Promise<string> {
  if (!process.env.AWS_ACCESS_KEY_ID?.trim() || !process.env.AWS_SECRET_ACCESS_KEY?.trim()) {
    throw new Error(
      'AWS認証情報（AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY）が設定されていません。'
    )
  }
  const prompt = buildPrompt(title, content)

  const requestBody = {
    prompt,
    negative_prompt: [
      'portrait, headshot, close-up face, selfie',
      'revealing clothing, cleavage, exposed skin',
      'western faces, caucasian, blonde',
      'text, typography, watermark, logo',
      'cartoon, anime, illustration, painting',
      'low quality, blurry, distorted, deformed',
      'bright neon colors, colorful',
      'nsfw, inappropriate',
    ].join(', '),
    mode: 'text-to-image',
    aspect_ratio: '16:9',
    output_format: 'jpeg',
  }

  const bodyBytes = new TextEncoder().encode(JSON.stringify(requestBody))
  const command = new InvokeModelCommand({
    modelId: 'stability.sd3-5-large-v1:0',
    contentType: 'application/json',
    accept: 'application/json',
    body: bodyBytes,
  })

  try {
    const client = getBedrockClient()
    const response = await client.send(command)

    const responseBody = JSON.parse(
      new TextDecoder().decode(response.body)
    ) as { images?: string[]; finish_reasons?: (string | null)[] }

    const reason = responseBody.finish_reasons?.[0]
    if (reason != null && reason !== '') {
      throw new Error(
        'コンテンツフィルターにより画像が生成されませんでした。プロンプトを変えて再試行してください。'
      )
    }

    const base64Image = responseBody.images?.[0]
    if (!base64Image) {
      throw new Error('画像データが返ってきませんでした')
    }

    return `data:image/jpeg;base64,${base64Image}`
  } catch (error) {
    console.error('Bedrock Stable Diffusion error:', error)
    let message = 'Stable Diffusion による画像生成に失敗しました'
    if (error instanceof Error) {
      message =
        error.name === 'AccessDeniedException'
          ? 'Bedrock の利用権限がありません。IAM に bedrock:InvokeModel を追加してください。'
          : error.name === 'ResourceNotFoundException'
            ? '指定したモデルが見つかりません。BEDROCK_REGION=us-west-2 を確認してください。'
            : error.message
    }
    throw new Error(message)
  }
}

/**
 * 記事タイトル・本文から英語の画像プロンプトを生成する
 * SD 3.5は英語プロンプトの方が品質が高い
 */
export function buildPrompt(title: string, content: string): string {
  const text = title + content.slice(0, 200)

  const isERP = /ERP|NetSuite|Dynamics|クラウドERP|基幹システム/.test(text)
  const isDX = /DX|デジタル|業務改善|業務効率|自動化|ワークフロー/.test(text)
  const isAgile = /アジャイル|短納期|スプリント|導入支援/.test(text)
  const isAPI = /API|連携|SaaS|システム連携|データ連携/.test(text)
  const isRecovery = /リカバリー|立て直し|失敗|頓挫|再構築/.test(text)

  let theme = ''

  if (isERP) {
    theme =
      'overhead flat-lay of laptop showing abstract ERP dashboard, notebook, pen and coffee on clean white desk, professional corporate photography, no readable text, no people'
  } else if (isDX) {
    theme =
      'overhead flat-lay of tablet with abstract workflow diagram, business documents and pen on clean white desk, digital transformation concept, no readable text, no people'
  } else if (isAgile) {
    theme =
      'wide shot of modern Japanese conference room, business team seen from behind gathered around whiteboard with sticky notes, agile sprint planning, no faces visible'
  } else if (isAPI) {
    theme =
      'overhead flat-lay of laptop with abstract system integration diagram on screen, notebook with flowchart sketches, pen on clean white desk, no readable text, no people'
  } else if (isRecovery) {
    const recoveryThemes = [
      'wide shot of modern conference room, business team seen from behind reviewing project documents on large screen, professional corporate photography, no faces visible',
      'overhead flat-lay of project planning documents, laptop with abstract dashboard, pen and notebook on clean white desk, professional corporate stock photography, no people',
    ]
    theme = recoveryThemes[Math.floor(Math.random() * recoveryThemes.length)]!
  } else {
    theme =
      'overhead flat-lay of Japanese business documents, notebook, pen and laptop on clean office desk, professional corporate style'
  }

  return [
    theme,
    'professional Japanese corporate photography',
    'photorealistic high quality',
    'navy blue white grey color palette',
    'soft natural window lighting',
    'NO faces NO close-up portraits NO headshots',
    'NO text NO watermark NO logo',
    'NO revealing clothing NO casual wear',
    'horizontal 16:9 composition',
    'wide or overhead shot',
  ].join(', ')
}
