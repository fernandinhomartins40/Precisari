import { Body, Controller, Headers, HttpCode, HttpStatus, Param, Post } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { z } from 'zod';
import {
  OAuthBody, OtpRequestBody, OtpVerifyBody, RefreshBody,
  type AuthSession, type AuthTokens,
} from '@precisari/shared';
import { otpRateLimit } from '../common/throttler';
import { ZodPipe } from '../common/zod.pipe';
import { AuthService } from './auth.service';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

const OAuthProviderParam = z.enum(['apple', 'google']);
const OTP_THROTTLE = { default: { limit: otpRateLimit, ttl: 60_000 } };

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly otp: OtpService,
    private readonly tokens: TokenService,
  ) {}

  @Post('otp/request')
  @HttpCode(HttpStatus.NO_CONTENT)
  @Throttle(OTP_THROTTLE)
  @ApiOperation({ summary: 'Envia um código de 6 dígitos por e-mail (sempre 204)' })
  async requestOtp(@Body(new ZodPipe(OtpRequestBody)) body: OtpRequestBody): Promise<void> {
    await this.otp.request(body.email);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @Throttle(OTP_THROTTLE)
  @ApiOperation({ summary: 'Valida o código e abre a sessão (AuthSession)' })
  verifyOtp(@Body(new ZodPipe(OtpVerifyBody)) body: OtpVerifyBody, @Headers('user-agent') ua?: string): Promise<AuthSession> {
    return this.auth.verifyOtp(body.email, body.code, ua);
  }

  @Post('oauth/:provider')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login social com idToken (Apple/Google)' })
  oauth(
    @Param('provider', new ZodPipe(OAuthProviderParam)) provider: z.infer<typeof OAuthProviderParam>,
    @Body(new ZodPipe(OAuthBody)) body: OAuthBody,
    @Headers('user-agent') ua?: string,
  ): Promise<AuthSession> {
    return this.auth.oauthLogin(provider, body.idToken, body.name, ua);
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Troca o refresh token (rotativo) por novos tokens' })
  refresh(@Body(new ZodPipe(RefreshBody)) body: RefreshBody, @Headers('user-agent') ua?: string): Promise<AuthTokens> {
    return this.tokens.rotate(body.refreshToken, ua);
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Revoga a sessão do refresh token' })
  async logout(@Body(new ZodPipe(RefreshBody)) body: RefreshBody): Promise<void> {
    await this.tokens.revoke(body.refreshToken);
  }
}
