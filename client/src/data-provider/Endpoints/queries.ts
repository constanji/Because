import { useRecoilValue } from 'recoil';
import { QueryKeys, dataService } from '@because/data-provider';
import { useQuery } from '@tanstack/react-query';
import type { QueryObserverResult, UseQueryOptions } from '@tanstack/react-query';
import type t from '@because/data-provider';
import store from '~/store';

export const useGetEndpointsQuery = <TData = t.TEndpointsConfig>(
  config?: UseQueryOptions<t.TEndpointsConfig, unknown, TData>,
): QueryObserverResult<TData> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TEndpointsConfig, unknown, TData>(
    [QueryKeys.endpoints],
    () => dataService.getAIEndpoints(),
    {
      // 移除 staleTime: Infinity，让 invalidateQueries 可以正常工作
      // 当配置更新时，调用 invalidateQueries([QueryKeys.endpoints]) 会触发重新获取
      staleTime: 0,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};

export const useGetStartupConfig = (
  config?: UseQueryOptions<t.TStartupConfig>,
): QueryObserverResult<t.TStartupConfig> => {
  const queriesEnabled = useRecoilValue<boolean>(store.queriesEnabled);
  return useQuery<t.TStartupConfig>(
    [QueryKeys.startupConfig],
    async () => {
      const result = await dataService.getStartupConfig();
      // 添加日志，调试配置获取
      console.log('[useGetStartupConfig] Fetched startup config:', {
        hasInterface: !!result?.interface,
        defaultEndpoint: result?.interface?.defaultEndpoint,
        defaultModel: result?.interface?.defaultModel,
        interfaceKeys: result?.interface ? Object.keys(result.interface) : [],
        fullInterface: JSON.stringify(result?.interface, null, 2),
      });
      return result;
    },
    {
      staleTime: Infinity,
      refetchOnWindowFocus: false,
      refetchOnReconnect: false,
      refetchOnMount: false,
      ...config,
      enabled: (config?.enabled ?? true) === true && queriesEnabled,
    },
  );
};
