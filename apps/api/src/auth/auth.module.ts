import { Global, Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AdminGuard, JwtAuthGuard } from './guards';
import { JwksOAuthVerifier, OAUTH_VERIFIER } from './oauth.verifier';
import { OtpService } from './otp.service';
import { TokenService } from './token.service';

@Global()
@Module({
  controllers: [AuthController],
  providers: [AuthService, OtpService, TokenService, JwtAuthGuard, AdminGuard, { provide: OAUTH_VERIFIER, useClass: JwksOAuthVerifier }],
  exports: [TokenService, JwtAuthGuard, AdminGuard],
})
export class AuthModule {}
