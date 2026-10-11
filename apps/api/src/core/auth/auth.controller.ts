import {
  Controller,
  Post,
  Body,
  Get,
  UseGuards,
  Res,
  Req,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { AuthService } from './auth.service.js';
import { AuthGuard, CurrentUser } from './auth.guard.js';
import {
  LoginPasswordDto,
  LoginPasswordSchema,
  RequestOtpDto,
  RequestOtpSchema,
  VerifyOtpDto,
  VerifyOtpSchema,
} from '@civil/shared';
import { Response, Request } from 'express';
import { JwtUserPayload } from './auth.types.js';

@ApiTags('Authentication')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Login with username & password (argon2)' })
  async loginWithPassword(
    @Body() body: LoginPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const validated = LoginPasswordSchema.parse(body);
    const result = await this.authService.loginWithPassword(validated.username, validated.password);

    // Set rotating refresh token in httpOnly cookie
    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('otp/request')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Request OTP for mobile number login' })
  async requestOtp(@Body() body: RequestOtpDto) {
    const validated = RequestOtpSchema.parse(body);
    return this.authService.requestOtp(validated.mobile);
  }

  @Post('otp/verify')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Verify mobile OTP and login' })
  async verifyOtp(
    @Body() body: VerifyOtpDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    const validated = VerifyOtpSchema.parse(body);
    const result = await this.authService.verifyOtp(validated.mobile, validated.otp);

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Rotate refresh token' })
  async refreshToken(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookieToken = req.cookies?.['refresh_token'];
    const result = await this.authService.refreshTokens(cookieToken);

    res.cookie('refresh_token', result.refreshToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return {
      accessToken: result.accessToken,
      user: result.user,
    };
  }

  @Get('me')
  @UseGuards(AuthGuard)
  @ApiOperation({ summary: 'Get current authenticated user profile & permissions' })
  async getMe(@CurrentUser() user: JwtUserPayload) {
    return user;
  }
}
